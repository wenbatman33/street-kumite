// 對戰：回合流程、碰撞（推擠／打擊／飛行道具／投技）、鏡頭、計時、訓練模式掛鉤
import { LAYOUT, VIEW_W, PHYS, FX, GAME } from './config.js';
import { Fighter } from './fighter.js';
import { PlayerInput } from './input.js';
import { Effects } from './effects.js';
import { audio } from './audio.js';

const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export class Battle {
  // opts: { chars:[def,def], stage, mode:'arcade'|'versus'|'training', controllers:[c,c], training }
  constructor(opts) {
    this.opts = opts;
    this.mode = opts.mode;
    this.stage = opts.stage;
    this.training = opts.training || null;
    this.controllers = opts.controllers;
    this.fx = new Effects();
    this.autoBoxes = true;
    this.fighters = opts.chars.map((def, i) => new Fighter(def, i, new PlayerInput(), this));
    if (opts.chars[0].id === opts.chars[1].id) this.fighters[1].alt = true;
    this.p = this.fighters;
    this.projectiles = [];
    this.round = 0;
    this.tick = 0;
    this.msgs = [];
    this.superT = 0;
    this.superOwner = null;
    this.slow = 0;
    this.comboShow = [null, null];
    this.frameData = [null, null];
    this.firstAttack = false;
    this.result = null;
    this.paused = false;
    this.startRound();
  }

  get isTraining() { return this.mode === 'training'; }

  startRound() {
    this.round++;
    const mid = LAYOUT.stageW / 2;
    const [a, b] = this.fighters;
    a.resetRound(mid - LAYOUT.startGap / 2, 1);
    b.resetRound(mid + LAYOUT.startGap / 2, -1);
    if (this.round === 1) { a.meter = 0; b.meter = 0; }
    for (const f of this.fighters) f.input.reset();
    this.projectiles = [];
    this.timer = GAME.time;
    this.timerTick = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.koT = 0;
    this.firstAttack = false;
    this.msgs = [];
    this.updateCamera(true);
    if (this.isTraining) {
      this.phase = 'fight';
      for (const f of this.fighters) f.toNeutral();
    }
  }

  // ---------- 主迴圈 ----------
  step() {
    this.tick++;
    // 記錄上一 tick 的位置，給高刷新率螢幕插值
    this.pcamX = this.camX;
    for (const f of this.fighters) { f.px = f.x; f.py = f.y; }
    for (const p of this.projectiles) p.px = p.x;
    // 讀取輸入（暗場中也要讀，保留搓招緩衝）
    this.fighters.forEach((f, i) => {
      const raw = this.controllers[i].poll(this, f, this.fighters[1 - i]);
      f.input.feed(raw);
      f.input.updateCharge(f.facing);
    });
    this.fx.update();
    this.msgs = this.msgs.filter((m) => ++m.t < m.life);

    if (this.superT > 0) {
      this.superT--;
      return;
    }
    if (this.slow > 0) {
      this.slow--;
      if (this.slow % FX.koSlow !== 0) return;
    }
    this.phaseLogic();

    const fighting = this.phase === 'fight';
    for (const f of this.fighters) if (fighting || f.state !== 'intro') this.thinkFighter(f, fighting);
    for (const f of this.fighters) f.update();
    for (const f of this.fighters) f.physics();
    this.updateProjectiles();
    this.resolvePush();
    this.updateCamera();
    this.clampFighters();
    if (fighting || this.phase === 'ko') this.resolveHits();
    this.updateFacing();
    this.releaseOrphanThrow();
    this.trackFrameData();
    this.trainingTick();
  }

  thinkFighter(f, fighting) {
    if (!fighting && (f.state === 'stand' || f.state === 'crouch')) return;
    f.think();
  }

  phaseLogic() {
    this.phaseT++;
    const [a, b] = this.fighters;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT === 12) {
          const final = a.wins === GAME.roundsToWin - 1 && b.wins === GAME.roundsToWin - 1;
          this.say(final ? 'FINAL ROUND' : `ROUND ${this.round}`, 70);
          audio.voice(final ? 'Final round' : `Round ${this.round}`);
        }
        if (this.phaseT === 86) {
          this.say('FIGHT!', 40, '#ffd84a');
          audio.voice('Fight!');
          audio.sfx('fight');
        }
        if (this.phaseT >= 92) {
          this.phase = 'fight';
          for (const f of this.fighters) f.toNeutral();
        }
        break;
      case 'fight':
        if (!this.isTraining && GAME.time < 100) {
          if (++this.timerTick >= PHYS.timerTicks) {
            this.timerTick = 0;
            this.timer = Math.max(0, this.timer - 1);
            if (this.timer === 0) this.timeOver();
          }
        }
        break;
      case 'ko': {
        this.koT++;
        const downed = this.fighters.filter((f) => f.hp <= 0);
        const settled = downed.every((f) => f.state === 'ko' && f.st > 50) && this.koT > 90;
        if (settled) this.endRound();
        break;
      }
      case 'timeover':
        this.koT++;
        if (this.koT === 70) this.endRound();
        break;
      case 'roundEnd':
        if (this.phaseT === 150) this.nextRound();
        break;
      default: break;
    }
  }

  say(text, life = 60, color = '#ffffff', sub = '') {
    this.msgs.push({ text, sub, life, t: 0, color });
  }

  sfx(name) { audio.sfx(name); }
  shake(a) { this.fx.shake(a); }
  dust(x, s) { this.fx.dust(x, s); }

  // ---------- 判定 ----------
  resolveHits() {
    const events = [];
    for (const a of this.fighters) {
      const d = this.fighters[1 - a.side];
      if (d.state === 'knockdown' || d.state === 'getup' || d.state === 'ko' || d.state === 'thrown' || d.state === 'intro') continue;
      const hurts = d.hurtboxes();
      if (!hurts.length) continue;
      for (const [i, h] of a.activeHits()) {
        if (d.state === 'airHit' && !(h.juggle && d.juggle < 4 && !d.ko)) continue;
        const hb = a.hitRect(h);
        const hit = hurts.find((r) => overlap(r, hb));
        if (hit) { events.push({ a, d, i, h, hb, hr: hit, mv: a.move }); break; }
      }
    }
    // 同時命中（相殺）一起處理
    for (const e of events) this.applyHit(e);
  }

  applyHit({ a, d, i, h, hb, hr, mv }) {
    // 互打（相殺）時，先處理的那下可能已經把攻擊方打出招式狀態，所以用偵測當下的招式
    if (a.hitDone) a.hitDone.add(i);
    a.contact = true;
    const dir = a.facing;
    const res = d.receive(a, h, { x: a.x, owner: a });
    a.hitstop = Math.max(a.hitstop, d.hitstop);
    const soh = mv && mv.stopOnHit;
    if (res === 'hit' && a.move === mv && (soh === true || (Array.isArray(soh) && a.mt >= soh[0] && a.mt <= soh[1]))) a.stopped = true;
    d.pushFrom = a;
    const px = (Math.max(hb.x0, hr.x0) + Math.min(hb.x1, hr.x1)) / 2;
    const py = (Math.max(hb.y0, hr.y0) + Math.min(hb.y1, hr.y1)) / 2;
    this.contactFx(a, d, res, h, px, py, dir);
  }

  contactFx(a, d, res, h, px, py, dir) {
    const strength = h.spark || h.hitstop || 'M';
    if (res === 'armor') {
      this.fx.spark(px, py, 'block', dir, strength);
      this.fx.ring(d.x, 170, '#ffb347', 1.2);
      this.fx.text(d.x, 330, 'ARMOR', '#ffb347', 24);
      audio.sfx('block');
      audio.sfx('hitM');
    } else if (res === 'block') {
      this.fx.spark(px, py, 'block', dir, strength);
      audio.sfx('block');
    } else {
      this.fx.spark(px, py, 'hit', dir, strength);
      audio.sfx(strength === 'L' ? 'hitL' : strength === 'M' ? 'hitM' : 'hitH');
      this.fx.shake(h.kd ? FX.shake.KD : FX.shake[strength === 'SU' ? 'H' : strength] || 0);
      if (d.counterHit) this.fx.text(d.x, 300, 'COUNTER', '#ff5a3c', 28);
      if (!this.firstAttack && !this.isTraining) {
        this.firstAttack = true;
        this.fx.text(a.x, 340, 'FIRST ATTACK', '#ffd84a', 26);
      }
      if (d.combo >= 2) this.comboShow[a.side] = { hits: d.combo, dmg: d.comboDmg, t: 0 };
    }
    this.contactInfo = { att: a, def: d, res, tick: this.tick };
  }

  onKO(d, a) {
    if (this.isTraining) return;
    if (this.phase === 'ko') return;
    this.phase = 'ko';
    this.koT = 0;
    this.slow = 60 * FX.koSlow;
    this.fx.flashT = 8;
    this.fx.shake(FX.shake.KO);
    for (const f of this.fighters) f.hitstop = FX.hitstop.KO;
    const both = this.fighters.every((f) => f.hp <= 0);
    this.say(both ? 'DOUBLE K.O.' : 'K.O.', 140, '#ff3b2f');
    audio.sfx('ko');
    audio.voice('K.O.');
  }

  timeOver() {
    this.phase = 'timeover';
    this.koT = 0;
    this.say('TIME OVER', 120, '#ffd84a');
    audio.voice('Time over');
    for (const f of this.fighters) if (f.state === 'stand' || f.state === 'crouch') f.setState('intro');
  }

  endRound() {
    const [a, b] = this.fighters;
    const ra = a.hp / a.def.hp, rb = b.hp / b.def.hp;
    let winner = null;
    if (ra > rb) winner = a;
    else if (rb > ra) winner = b;
    this.phase = 'roundEnd';
    this.phaseT = 0;
    if (winner) {
      winner.wins++;
      const loser = this.fighters[1 - winner.side];
      if (winner.state !== 'airHit') { winner.setState('win'); winner.vx = 0; }
      if (loser.hp > 0) loser.setState('lose');
      const perfect = winner.hp === winner.def.hp;
      this.say(`${winner.def.name} WINS`, 150, '#ffffff', perfect ? 'PERFECT' : '');
      audio.voice(perfect ? 'Perfect' : `${winner.def.name} wins`);
      this.lastWinner = winner.side;
    } else {
      a.wins++; b.wins++;
      this.say('DRAW GAME', 150);
      audio.voice('Draw game');
      this.lastWinner = -1;
    }
  }

  nextRound() {
    const [a, b] = this.fighters;
    const need = GAME.roundsToWin;
    if (a.wins >= need || b.wins >= need) {
      this.phase = 'matchEnd';
      this.result = a.wins >= need && b.wins >= need ? -1 : a.wins >= need ? 0 : 1;
      return;
    }
    this.startRound();
  }

  // ---------- 飛行道具 ----------
  hasProjectile(f) { return this.projectiles.some((p) => p.owner === f); }

  spawnProjectile(f, spec) {
    const p = {
      owner: f, spec, kind: spec.kind,
      x: f.x + f.facing * spec.x, y: f.y + spec.y,
      vx: spec.vx * f.facing, vy: spec.vy || 0, facing: f.facing,
      life: spec.life, t: 0, scale: spec.scale || 1,
      hits: spec.multi ? spec.multi.count : 1, cool: 0, hp: spec.multi ? spec.multi.count : 1,
    };
    p.px = p.x;
    this.projectiles.push(p);
    audio.sfx(spec.sound || (spec.super ? 'superball' : 'fireball'));
  }

  projRect(p) {
    const [bx, by, bw, bh] = p.spec.box;
    return { x0: p.x + bx, x1: p.x + bx + bw, y0: p.y + by, y1: p.y + by + bh };
  }

  updateProjectiles() {
    for (const p of this.projectiles) {
      if (p.owner.hitstop > 0 && p.t === 0) continue;
      p.t++;
      if (p.cool > 0) { p.cool--; p.x += p.vx * 0.25; } else { p.x += p.vx; p.y += p.vy; }
      if (p.vy && p.y <= 4) { p.dead = true; this.fx.spark(p.x, 6, 'block', p.facing, 'L'); }   // 斜射道具落地
      if (p.t > p.life || p.x < -200 || p.x > LAYOUT.stageW + 200) p.dead = true;
      if (Math.abs(p.x - (this.camX + VIEW_W / 2)) > VIEW_W / 2 + 160) p.dead = true;
    }
    // 道具互相抵消
    const ps = this.projectiles;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const A = ps[i], B = ps[j];
        if (A.dead || B.dead || A.owner === B.owner || A.spec.noClash || B.spec.noClash) continue;
        if (overlap(this.projRect(A), this.projRect(B))) {
          const n = Math.min(A.hp, B.hp);
          A.hp -= n; B.hp -= n;
          if (A.hp <= 0) A.dead = true;
          if (B.hp <= 0) B.dead = true;
          this.fx.spark((A.x + B.x) / 2, A.y, 'hit', 1, 'H');
          audio.sfx('clash');
        }
      }
    }
    // 打到角色
    if (this.phase === 'fight' || this.phase === 'ko') {
      for (const p of ps) {
        if (p.dead || p.cool > 0) continue;
        if (p.spec.activeT && (p.t < p.spec.activeT[0] || p.t > p.spec.activeT[1])) continue;
        const d = this.fighters[1 - p.owner.side];
        if (['knockdown', 'getup', 'ko', 'thrown', 'intro', 'win'].includes(d.state)) continue;
        if (d.state === 'move' && (d.invuln('strike') || d.invuln('proj'))) continue;
        const last = p.spec.multi && p.hits === 1;
        const hit = last ? { ...p.spec.hit, ...p.spec.multi.last } : p.spec.hit;
        if (d.state === 'airHit' && !((p.spec.super || p.spec.juggle) && d.juggle < 6)) continue;
        const r = this.projRect(p);
        const hr = d.hurtboxes().find((h) => overlap(h, r));
        if (!hr) continue;
        const res = d.receive(p.owner, { ...hit, juggle: !!p.spec.super }, { x: p.x - p.vx * 4, owner: p.owner, proj: true });
        p.owner.contact = true;
        p.hits--;
        p.hp--;
        if (p.hits <= 0) p.dead = true;
        else p.cool = p.spec.multi.gap;
        this.contactFx(p.owner, d, res, hit, (r.x0 + r.x1) / 2 + (p.facing > 0 ? 30 : -30), p.y, p.facing);
      }
    }
    if (ps.some((p) => p.dead)) {
      for (const p of ps) if (p.dead) this.fx.ring(p.x, p.y, '#ffb347', p.scale);
      this.projectiles = ps.filter((p) => !p.dead);
    }
  }

  // ---------- 投技 ----------
  canThrow(a, m = a.def.throw) {
    const d = this.fighters[1 - a.side];
    const T = m;
    if (a.airborne || d.airborne) return false;
    if (!['stand', 'crouch', 'move', 'landing', 'prejump', 'dizzy'].includes(d.state)) return false;
    if (d.throwInv > 0 || d.invuln('throw') || d.invuln('all')) return false;
    if (d.state === 'move' && d.move.type === 'throw' && d.grabbed) return false;
    return Math.abs(d.x - a.x) <= T.range;
  }

  tryGrab(a, m = a.def.throw) {
    if (!this.canThrow(a, m)) return false;
    const d = this.fighters[1 - a.side];
    const T = m.onGrab;
    a.grabMove = m;
    a.vx = 0;
    a.stopped = true;
    a.grabbed = true;
    a.throwing = d;
    a.seq = T.seq;
    a.mt = 0;
    a.contact = true;
    d.setState('thrown', { thrownBy: a });
    d.facing = -a.facing;
    d.vx = 0; d.vy = 0; d.y = 0; d.pushV = 0;
    d.combo = 0; d.comboDmg = 0;
    audio.sfx('grab');
    return true;
  }

  tickThrow(a) {
    const d = a.throwing;
    if (!d || d.state !== 'thrown') return;
    const T = (a.grabMove || a.def.throw).onGrab;
    if (T.path) {
      // 依關鍵影格移動被投者：[tick, 前方距離, 高度]
      const P = T.path;
      let k = P.length - 1;
      for (let i = 0; i < P.length - 1; i++) if (a.mt < P[i + 1][0]) { k = i; break; }
      const [t0, x0, y0] = P[k], [t1, x1, y1] = P[Math.min(k + 1, P.length - 1)];
      const u = t1 > t0 ? Math.max(0, Math.min(1, (a.mt - t0) / (t1 - t0))) : 1;
      d.x = a.x + a.facing * (x0 + (x1 - x0) * u);
      d.y = y0 + (y1 - y0) * u;
      if (Math.abs(x1 - x0) > 1 && Math.sign(x1) !== Math.sign(x0)) d.facing = a.mt < (t0 + t1) / 2 ? -a.facing : a.facing;
    } else {
      const tx = a.x + a.facing * 90;
      d.x += (tx - d.x) * 0.5;
    }
    if (a.mt === T.hitT) {
      a.throwing = null;
      const dmg = this.noDamage(d) ? 0 : T.dmg;
      d.hp = Math.max(this.noKO(d) ? 1 : 0, d.hp - dmg);
      d.combo = 1; d.comboDmg = dmg; d.lastDmg = dmg;
      d.stun += T.stun;
      a.gainMeter(10);
      this.fx.spark(d.x, 170, 'hit', a.facing, 'H');
      this.fx.shake(FX.shake.H);
      audio.sfx(T.sound || 'hitH');
      if (d.hp <= 0) { d.knockOut(a, {}, a.facing); return; }
      d.setState('airHit', { airReset: false, inKD: true, ko: false });
      d.vx = a.facing * T.launch[0];
      d.vy = T.launch[1];
      d.y = Math.max(0.01, d.y);
      d.hitstop = T.hitstop || 6; a.hitstop = T.hitstop || 6;
      if (T.shake) this.fx.shake(T.shake);
      if (T.dust) this.fx.dust(d.x, 1.6);
    }
  }

  // 瞬移：mode = fwd（往前）/ behind（到對手背後）/ back（往後）
  teleport(f, spec) {
    const o = this.fighters[1 - f.side];
    const from = f.x;
    let x;
    if (spec.mode === 'behind') x = o.x + Math.sign(o.x - f.x || f.facing) * (spec.dist || 110);
    else if (spec.mode === 'back') x = f.x - f.facing * (spec.dist || 260);
    else x = f.x + f.facing * (spec.dist || 220);
    f.x = Math.max(LAYOUT.edge, Math.min(LAYOUT.stageW - LAYOUT.edge, x));
    f.px = f.x;
    if (spec.mode === 'behind' || spec.face) f.facing = Math.sign(o.x - f.x) || f.facing;   // 繞到背後要轉身面對
    this.smoke(from);
    this.smoke(f.x);
    audio.sfx('rise');
  }

  smoke(x) {
    for (let i = 0; i < 8; i++) this.fx.list.push({ type: 'dust', x: x + (Math.random() - 0.5) * 70, y: 40 + Math.random() * 200, vx: (Math.random() - 0.5) * 2, vy: 0.8 + Math.random(), r: 18 + Math.random() * 16, t: 0, life: 30, color: '#9b7bd8' });
  }

  // 保險：投技方已不在抓取狀態（例如被別的東西中斷）時，放開被投者
  releaseOrphanThrow() {
    for (const d of this.fighters) {
      if (d.state !== 'thrown') continue;
      const a = d.thrownBy;
      if (a && a.state === 'move' && a.grabbed && a.throwing === d) continue;
      d.setState('airHit', { airReset: false, inKD: true, ko: false });
      d.vx = 0; d.vy = 4; d.y = Math.max(d.y, 0.01);
    }
  }

  techThrow(a, d) {
    if (!a || !a.grabbed) return;
    if ((a.grabMove || a.def.throw).onGrab.noTech) return;   // 指令投無法拆
    a.grabbed = false;
    a.throwing = null;
    const dir = Math.sign(d.x - a.x) || -a.facing;
    a.setState('blockstun', { stunT: 16, lowStance: false });
    d.setState('blockstun', { stunT: 16, lowStance: false });
    a.pushV = -dir * 9;
    d.pushV = dir * 9;
    this.fx.spark((a.x + d.x) / 2, 180, 'block', dir, 'M');
    this.fx.text((a.x + d.x) / 2, 320, 'TECH', '#7fe3ff', 26);
    audio.sfx('block');
  }

  // ---------- 推擠與邊界 ----------
  resolvePush() {
    const [A, B] = this.fighters;
    if (A.state === 'thrown' || B.state === 'thrown') return;
    const pa = A.pushbox(), pb = B.pushbox();
    if (!(pa.x1 > pb.x0 && pb.x1 > pa.x0 && pa.y1 > pb.y0 && pb.y1 > pa.y0)) return;
    const ov = Math.min(pa.x1 - pb.x0, pb.x1 - pa.x0);
    let dir = Math.sign(A.x - B.x);
    if (!dir) dir = A.facing > 0 ? -1 : 1;
    // 空中落到對手頭上時，讓空中的人滑開
    if (A.airborne && !B.airborne) A.x += dir * ov;
    else if (B.airborne && !A.airborne) B.x -= dir * ov;
    else { A.x += (dir * ov) / 2; B.x -= (dir * ov) / 2; }
  }

  bounds() {
    const lo = Math.max(LAYOUT.edge, this.camX + LAYOUT.edge);
    const hi = Math.min(LAYOUT.stageW - LAYOUT.edge, this.camX + VIEW_W - LAYOUT.edge);
    return [lo, hi];
  }

  clampFighters() {
    const [lo, hi] = this.bounds();
    for (const f of this.fighters) {
      const before = f.x;
      f.x = Math.max(lo, Math.min(hi, f.x));
      const hitWall = before !== f.x;
      f.atWall = f.x <= lo + 0.5 ? -1 : f.x >= hi - 0.5 ? 1 : 0;
      // 被推到牆角 → 推力轉給攻擊方
      if (hitWall && f.pushV && f.pushFrom && !f.pushFrom.airborne && Math.sign(f.pushV) === f.atWall) {
        f.pushFrom.pushV = -f.pushV * 0.9;
        f.pushV = 0;
      }
    }
    // 再推擠一次，避免夾在牆角時重疊
    this.resolvePush();
    for (const f of this.fighters) f.x = Math.max(lo, Math.min(hi, f.x));
  }

  updateCamera(snap) {
    const [a, b] = this.fighters;
    const mid = (a.x + b.x) / 2;
    const target = Math.max(0, Math.min(LAYOUT.stageW - VIEW_W, mid - VIEW_W / 2));
    if (snap || this.camX === undefined) { this.camX = target; this.pcamX = target; }
    else this.camX += (target - this.camX) * 0.5;
  }

  updateFacing() {
    const [a, b] = this.fighters;
    for (const f of [a, b]) {
      const o = f === a ? b : a;
      if (f.state === 'stand' || f.state === 'crouch' || f.state === 'intro' || f.state === 'dizzy') {
        const want = Math.sign(o.x - f.x);
        if (want && want !== f.facing) f.facing = want;
      }
    }
  }

  // ---------- 給角色查詢 ----------
  threat(f) {
    const o = this.fighters[1 - f.side];
    if (o.state === 'move' && o.move.hits && o.move.hits.length && o.mt <= o.move.lastActive && Math.abs(o.x - f.x) < 330) return true;
    return this.projectiles.some((p) => p.owner !== f && Math.sign(f.x - p.x) === Math.sign(p.vx) && Math.abs(p.x - f.x) < 320);
  }

  superFlash(f) {
    this.superT = FX.superFlash;
    this.superOwner = f;
    this.superStart = this.tick;
    audio.sfx('super');
    audio.voice(f.def.moveNames.super.zh.split('・')[1] ? 'Super!' : 'Super!');
  }

  onMoveStart(f, mv) {
    if (mv.sound && mv.type !== 'super') audio.sfx(mv.sound);
    else if (mv.type === 'normal') audio.sfx(mv.name.includes('H') ? 'whiffH' : mv.name.includes('M') ? 'whiffM' : 'whiffL');
    if (mv.shout) audio.shout(f.def.id);
    this.frameData[f.side] = { name: mv.name, startup: mv.firstActive, active: mv.hits && mv.hits.length ? mv.lastActive - mv.firstActive + 1 : 0, recovery: mv.total - (mv.lastActive || mv.firstActive), adv: null, t0: this.tick };
  }

  infiniteMeter(f) { return !!(this.training && this.training.meter === 'infinite'); }
  noDamage() { return false; }
  noKO(f) { return this.isTraining; }

  autoBlock(f, hit) {
    if (!this.training || f.side !== 1) return false;
    const mode = this.training.block;
    if (mode === 'all') return true;
    if (mode === 'after') return f.state === 'blockstun' || (this.tick - (f.lastHurtTick || -999) < 40 && f.state !== 'stand' && f.state !== 'crouch') || f.recentHit;
    if (mode === 'random') { if (f.randBlockTick !== this.tick) { f.randBlockTick = this.tick; f.randBlock = f.state === 'blockstun' || Math.random() < 0.5; } return f.randBlock; }
    return false;
  }

  // ---------- 訓練模式：frame data、血量回復 ----------
  trackFrameData() {
    const c = this.contactInfo;
    for (const f of this.fighters) {
      if (f.state === 'hitstun' || f.state === 'airHit') f.lastHurtTick = this.tick;
    }
    if (!c || c.done) return;
    const { att, def } = c;
    const fd = this.frameData[att.side];
    const free = (f) => f.state === 'stand' || f.state === 'crouch' || (f.state === 'air' && !f.airUsed);
    if (att.state === 'move' && att.mt === 0) { c.done = true; return; }   // 取消出招，不計算
    if (c.attFree === undefined && free(att)) c.attFree = this.tick;
    if (c.defFree === undefined && free(def)) c.defFree = this.tick;
    if (c.attFree !== undefined && c.defFree !== undefined) {
      if (fd) { fd.adv = c.defFree - c.attFree; fd.res = c.res; }
      c.done = true;
    }
    if (this.tick - c.tick > 240) c.done = true;
  }

  trainingTick() {
    for (const s of this.comboShow) if (s) s.t++;
    this.fighters.forEach((f, i) => {
      const s = this.comboShow[1 - i];
      if (s && (f.state === 'stand' || f.state === 'crouch') && s.t > 40) s.fade = (s.fade || 0) + 1;
      if (s && s.fade > 30) this.comboShow[1 - i] = null;
    });
    if (!this.training) return;
    for (const f of this.fighters) {
      const idle = f.state === 'stand' || f.state === 'crouch' || f.state === 'air';
      if (idle) f.idleT = (f.idleT || 0) + 1; else f.idleT = 0;
      if (this.training.refill && f.idleT === 50) { f.hp = f.def.hp; f.hpTrail = f.hp; f.stun = 0; }
      if (this.training.meter === 'infinite') f.meter = 100;
    }
  }

  resetPositions(where = 'center') {
    const [a, b] = this.fighters;
    const mid = where === 'left' ? 260 : where === 'right' ? LAYOUT.stageW - 260 : LAYOUT.stageW / 2;
    const gap = where === 'center' ? LAYOUT.startGap / 2 : 0;
    const swap = where === 'right';
    a.resetRound(where === 'center' ? mid - gap : swap ? mid - 60 : mid + 60, 1);
    b.resetRound(where === 'center' ? mid + gap : swap ? mid + 80 : mid - 80, -1);
    if (where === 'left') { a.x = 340; b.x = 140; } // P1 把對手逼在左牆角
    if (where === 'right') { a.x = LAYOUT.stageW - 340; b.x = LAYOUT.stageW - 140; }
    a.facing = Math.sign(b.x - a.x) || 1; b.facing = -a.facing;
    for (const f of this.fighters) { f.toNeutral(); f.meter = this.training && this.training.meter === 'infinite' ? 100 : f.meter; }
    this.projectiles = [];
    this.updateCamera(true);
    this.clampFighters();
  }
}
