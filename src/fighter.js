// 角色狀態機：輸入判斷 → 招式時間軸 → 物理 → 受擊／防禦
import { PHYS, LAYOUT, FX } from './config.js';
import { STATE_ANIMS, HURT, STRENGTH } from './chars/common.js';
import { ASSETS } from './assets.js';
import { rel } from './input.js';

const NEUTRAL = new Set(['stand', 'crouch']);
const BLOCKABLE = new Set(['stand', 'crouch', 'blockstun']);

export class Fighter {
  constructor(def, side, input, battle) {
    this.def = def;
    this.side = side;              // 0 = P1、1 = P2
    this.input = input;
    this.battle = battle;
    this.alt = false;              // 同角色對戰時的替代配色
    this.wins = 0;
    this.resetRound(0, 1);
  }

  resetRound(x, facing) {
    this.x = x; this.y = 0;
    this.px = x; this.py = 0;   // 上一 tick 位置（畫面插值用）
    this.vx = 0; this.vy = 0; this.pushV = 0;
    this.facing = facing;
    this.hp = this.def.hp;
    this.hpTrail = this.def.hp;
    this.meter = this.meter ?? 0;
    this.stun = 0; this.stunIdle = 0; this.pendingDizzy = false;
    this.hitstop = 0; this.flash = 0; this.shake = 0;
    this.combo = 0; this.comboDmg = 0;
    this.juggle = 0;
    this.throwInv = 0;
    this.queued = null;
    this.move = null;
    this.thrownBy = null; this.throwing = null;
    this.setState('intro');
  }

  // ---------- 狀態 ----------
  setState(s, extra = {}) {
    this.state = s;
    this.st = 0;
    Object.assign(this, extra);
    if (s !== 'move') { this.move = null; }
  }

  get airborne() { return this.y > 0.01 || this.state === 'air' || this.state === 'airHit'; }
  get crouching() {
    if (this.state === 'crouch') return true;
    if (this.state === 'move') return !!this.move.crouch;
    if (this.state === 'blockstun' || this.state === 'hitstun') return !!this.lowStance;
    return false;
  }
  get actionable() { return NEUTRAL.has(this.state); }

  toNeutral() {
    const rd = this.input.relDir(this.facing);
    if (this.pendingDizzy) { this.pendingDizzy = false; this.setState('dizzy', { dizzyT: PHYS.dizzyTicks }); this.stun = 0; return; }
    this.setState(rd <= 3 ? 'crouch' : 'stand');
    this.st = 4;   // 不重播蹲下過渡
    this.juggle = 0;
    this.inKD = false;
  }

  // ---------- 每 tick：決策 ----------
  think() {
    const inp = this.input;
    if (this.hitstop > 0) {
      // 頓幀中仍可輸入取消（排入佇列，頓幀結束後出招）
      if (this.state === 'move' && !this.queued) this.queued = this.cancelCheck();
      return;
    }
    if (this.queued) {
      const q = this.queued;
      this.queued = null;
      if (this.state === 'move') { this.startMove(q); return; }
    }
    const rd = inp.relDir(this.facing);

    if (this.state === 'move') {
      const c = this.cancelCheck();
      if (c) this.startMove(c);
      return;
    }

    if (this.state === 'dizzy') {
      // 連打恢復
      for (const b of ['LP', 'MP', 'HP', 'LK', 'MK', 'HK']) if (inp.pressedNow(b)) this.dizzyT -= 6;
      if (inp.hist[inp.hist.length - 1].t === inp.frame) this.dizzyT -= 3;
      return;
    }

    if (this.state === 'thrown') {
      // 投技解除
      if (this.st <= PHYS.techWindow && (inp.pair('LP', 'LK') || ((rd === 4 || rd === 6) && inp.buffered('HP')))) {
        this.battle.techThrow(this.thrownBy, this);
      }
      return;
    }

    if (this.state === 'prejump') {
      // 360 指令投：轉到「上」會先進入起跳預備，這幾格內仍可出指令投
      const sp = this.specialCheck(null, { filter: (mv) => mv.prejumpOK });
      if (sp) this.startMove(sp);
      return;
    }

    if (this.state === 'air') {
      // 二段跳：空中重新按「上」
      const last = inp.hist[inp.hist.length - 1], prev = inp.hist[inp.hist.length - 2];
      if (this.def.doubleJump && !this.dblUsed && last.t === inp.frame && rd >= 7 && prev && rel(prev.d, this.facing) < 7 && this.st > 6) {
        this.dblUsed = true;
        this.vy = this.def.jumpVy * 0.82;
        this.vx = (rd === 9 ? 1 : rd === 7 ? -1 : 0) * this.def.jumpVx * this.facing;
        this.st = 0;
        this.battle.fx.ring(this.x, this.y + 20, '#c9a7ff', 0.8);
        return;
      }
      // 空中必殺技（例：忍者空中苦無）
      const asp = this.specialCheck(null, { air: true });
      if (asp) { this.startMove(asp, { keepVel: true }); return; }
      if (!this.airUsed) {
        for (const b of ['HK', 'HP', 'MK', 'MP', 'LK', 'LP']) {
          if (inp.buffered(b)) {
            inp.consume(b);
            this.airUsed = true;
            this.startMove('j' + b, { keepVel: true });
            return;
          }
        }
      }
      return;
    }

    if (!this.actionable) return;

    // 必殺技（含超必殺）
    const sp = this.specialCheck();
    if (sp) { this.startMove(sp); return; }

    // 投技：LP+LK 同按，或 前/後 + HP 在投技距離內
    const throwPair = inp.pair('LP', 'LK');
    const throwDir = (rd === 4 || rd === 6) && inp.buffered('HP');
    if ((throwPair || throwDir) && this.state === 'stand') {
      if (this.battle.canThrow(this)) {
        inp.consume('LP'); inp.consume('LK'); inp.consume('HP');
        this.startMove('throw');
        return;
      }
      if (throwPair) {
        inp.consume('LP'); inp.consume('LK');
        this.startMove('throw');
        return;
      }
    }

    // 普通技（重 > 中 > 輕）
    for (const b of ['HK', 'HP', 'MK', 'MP', 'LK', 'LP']) {
      if (inp.buffered(b)) {
        inp.consume(b);
        this.startMove((rd <= 3 ? '2' : '5') + b);
        return;
      }
    }

    // 移動
    if (rd >= 7) {
      this.jumpDir = rd === 9 ? 1 : rd === 7 ? -1 : 0;
      this.setState('prejump');
      return;
    }
    if (rd <= 3) {
      if (this.state !== 'crouch') this.setState('crouch');
      return;
    }
    if (this.state === 'crouch') this.setState('stand');
  }

  // opts.air：空中版必殺技；opts.filter：只允許符合條件的招式
  specialCheck(cancelFrom, opts = {}) {
    const inp = this.input;
    if (this.airborne !== !!opts.air) return null;
    for (const sp of this.def.specials) {
      if (opts.air && !sp.air) continue;
      const btns = sp.btn === 'P' ? ['HP', 'MP', 'LP'] : ['HK', 'MK', 'LK'];
      const b = btns.find((x) => inp.buffered(x));
      if (!b) continue;
      if (!inp.motion(sp.motion, this.facing)) continue;
      const base = opts.air ? sp.air : sp.move;
      const name = base === 'super' ? 'super' : `${base}_${STRENGTH[b]}`;
      const mv = this.def.moves[name];
      if (!mv) continue;
      if (opts.filter && !opts.filter(mv)) continue;
      if (cancelFrom && cancelFrom.type === 'special' && mv.type !== 'super') continue;
      if (mv.meter && this.meter < mv.meter && !this.battle.infiniteMeter(this)) continue;
      if (mv.proj && this.battle.hasProjectile(this)) continue;
      inp.consume(b);
      if (sp.motion === 'CBF') inp.useCharge('B');
      if (sp.motion === 'CDU') inp.useCharge('D');
      return name;
    }
    return null;
  }

  cancelCheck() {
    const m = this.move;
    if (!m || !this.contact) return null;
    if (m.type === 'normal' && m.cancel && this.mt <= m.lastActive + 10) return this.specialCheck(m);
    if (m.type === 'special' && this.mt <= m.lastActive + 12) return this.specialCheck(m);
    return null;
  }

  startMove(name, opts = {}) {
    const mv = this.def.moves[name];
    if (!mv) return;
    this.setState('move');
    this.move = mv;
    this.moveName = name;
    this.mt = 0;
    this.seq = mv.seq;
    this.contact = false;
    this.hitDone = new Set();
    this.lockFailed = false;
    this.stopped = false;
    this.grabbed = false;
    this.armorUsed = 0;
    if (!opts.keepVel) this.vx = 0;
    if (mv.type === 'super') {
      if (!this.battle.infiniteMeter(this)) this.meter = Math.max(0, this.meter - (mv.meter || 0));
      this.battle.superFlash(this);
    }
    if (mv.whiffMeter) this.gainMeter(mv.whiffMeter);
    this.battle.onMoveStart(this, mv);
  }

  gainMeter(v) { this.meter = Math.min(100, this.meter + v); }

  // ---------- 每 tick：推進 ----------
  update() {
    if (this.hitstop > 0) { this.hitstop--; return; }
    if (this.flash > 0) this.flash--;
    if (this.throwInv > 0) this.throwInv--;
    this.st++;
    const d = this.def;

    switch (this.state) {
      case 'stand': {
        const rd = this.input.relDir(this.facing);
        this.guarding = false;
        if (rd === 6) this.vx = d.walkF * this.facing;
        else if (rd === 4) {
          if (this.battle.threat(this)) { this.vx = 0; this.guarding = true; } else this.vx = -d.walkB * this.facing;
        } else this.vx = 0;
        this.walk = rd === 6 ? 1 : rd === 4 && !this.guarding ? -1 : 0;
        break;
      }
      case 'crouch': this.vx = 0; this.guarding = this.input.relDir(this.facing) === 1 && this.battle.threat(this); break;
      case 'prejump':
        this.vx = 0;
        if (this.st >= PHYS.prejump) {
          this.vy = d.jumpVy;
          this.vx = this.jumpDir * d.jumpVx * this.facing;
          this.y = 0.01;
          this.setState('air', { airUsed: false, dblUsed: false });
        }
        break;
      case 'move': this.tickMove(); break;
      case 'landing':
        this.vx = 0;
        if (this.st >= this.landT) this.toNeutral();
        break;
      case 'hitstun':
      case 'blockstun':
        if (this.st >= this.stunT) this.toNeutral();
        break;
      case 'knockdown':
        this.vx = 0;
        if (this.st >= PHYS.knockdownLie) this.setState('getup');
        break;
      case 'getup':
        if (this.st >= PHYS.getup) { this.throwInv = 6; this.toNeutral(); }
        break;
      case 'dizzy':
        this.vx = 0;
        this.dizzyT--;
        if (this.dizzyT <= 0) this.toNeutral();
        break;
      case 'thrown': break;     // 位置由投技方控制
      default: break;
    }

    // 暈眩值自然回復
    this.stunIdle++;
    if (this.stunIdle > 120 && this.stun > 0) this.stun = Math.max(0, this.stun - PHYS.stunDecay);
    // 血條紅色殘影
    if (this.hpTrail > this.hp) this.hpTrail -= this.combo > 0 && (this.state === 'hitstun' || this.state === 'airHit') ? 0 : Math.max(2, (this.hpTrail - this.hp) * 0.06);
    if (this.hpTrail < this.hp) this.hpTrail = this.hp;
  }

  tickMove() {
    const m = this.move;
    this.mt++;
    const t = this.mt;
    if (this.lockFailed) {
      // 鎖定技落空：只播收招，不再執行位移／跳躍／道具腳本
      if (!this.airborne) this.vx = 0;
    } else {
      // 地面速度腳本
      if (!this.airborne) {
        let vx = 0;
        if (m.vel) for (const [a, b, v] of m.vel) if (t >= a && t <= b) vx = v;
        if (this.stopped) vx = 0;
        this.vx = vx * this.facing;
      }
      if (m.jump && t === m.jump.t) {
        this.vy = m.jump.vy;
        this.vx = m.jump.vx * this.facing;
        this.y = Math.max(this.y, 0.01);
      }
      if (m.proj && t === m.proj.t) this.battle.spawnProjectile(this, m.proj);
      if (m.lock && t === m.lock.by && !this.hitDone.has(m.lock.hit)) {
        this.lockFailed = true;
        this.seq = m.lock.whiff;
        this.mt = 0;
        this.vx = 0;
        return;
      }
    }
    // 投技／指令投：抓取判定
    if (m.grab && !this.grabbed && !this.lockFailed && t >= m.grab.t[0] && t <= m.grab.t[1]) {
      if (this.battle.tryGrab(this, m)) return;
    }
    if (this.grabbed) this.battle.tickThrow(this);
    // 瞬移（可多段）
    if (m.teleport && !this.lockFailed) {
      for (const tp of Array.isArray(m.teleport) ? m.teleport : [m.teleport]) if (t === tp.t) this.battle.teleport(this, tp);
    }
    const total = this.seq.reduce((s, e) => s + e[1], 0);
    if (t >= total) {
      if (this.airborne && (m.holdLast || m.air)) {
        if (m.air && !m.holdLast) this.setState('air', { airUsed: true });
        return;   // 維持最後一格直到落地
      }
      this.grabbed = false;
      this.toNeutral();
    }
  }

  // 落地處理（由物理呼叫）
  onLand() {
    this.y = 0;
    this.vy = 0;
    switch (this.state) {
      case 'air':
        this.setState('landing', { landT: PHYS.landing, landSeq: null });
        this.vx = 0;
        break;
      case 'move': {
        const m = this.move;
        if (m.landLag) this.setState('landing', { landT: m.landLag.reduce((s, e) => s + e[1], 0), landSeq: m.landLag, landAnim: m.anim });
        else this.setState('landing', { landT: PHYS.landing, landSeq: null });
        if (m.landShake) this.battle.shake(m.landShake);
        this.vx = 0;
        this.battle.dust(this.x, 0.8);
        break;
      }
      case 'airHit':
        if (this.ko) { this.setState('ko'); this.battle.dust(this.x, 1.6); this.battle.shake(FX.shake.KD); this.battle.sfx('land'); break; }
        if (this.airReset) { this.setState('landing', { landT: 6, landSeq: null }); this.vx = 0; break; }
        this.setState('knockdown');
        this.vx = 0;
        this.battle.dust(this.x, 1.3);
        this.battle.shake(FX.shake.KD);
        this.battle.sfx('land');
        break;
      default:
        this.vx = 0;
    }
  }

  physics() {
    if (this.hitstop > 0) return;
    if (this.state === 'thrown') return;
    if (this.y > 0 || this.vy > 0) {
      this.vy -= this.state === 'airHit' ? PHYS.gravity * 0.92 : PHYS.gravity;
      this.y += this.vy;
      this.x += this.vx;
      if (this.y <= 0) this.onLand();
    } else {
      this.x += this.vx;
    }
    if (this.pushV) {
      this.x += this.pushV;
      this.pushV *= PHYS.pushDecay;
      if (Math.abs(this.pushV) < 0.08) this.pushV = 0;
    }
  }

  // ---------- 受擊 ----------
  // hit：判定資料；src：{ x, owner, proj }；回傳 'hit' | 'block'
  receive(att, hit, src) {
    const away = Math.sign(this.x - src.x) || -att.facing;
    const raw = this.input.raw;
    const holdAway = (raw.right ? 1 : 0) - (raw.left ? 1 : 0) === away;
    const down = raw.down;
    let canBlock = BLOCKABLE.has(this.state) && !this.airborne && !hit.unblockable;
    if (this.state === 'stand' || this.state === 'crouch' || this.state === 'blockstun') {
      // 依目前按的方向決定蹲/站防
    }
    let blocked = false;
    const auto = this.battle.autoBlock(this, hit);
    if (canBlock && (auto || holdAway)) {
      const crouchBlock = auto ? hit.guard === 'low' || (hit.guard !== 'high' && down) : down;
      if (hit.guard === 'low' && !crouchBlock) blocked = false;
      else if (hit.guard === 'high' && crouchBlock) blocked = false;
      else blocked = true;
      if (blocked) this.lowStance = crouchBlock;
    }
    const hs = FX.hitstop[hit.hitstop || 'M'];

    // 霸體：出招中特定區間挨打不中斷（只吃一半傷害），armor = [開始, 結束, 可吸收次數]
    if (!blocked && this.state === 'move' && this.move.armor && !hit.unblockable) {
      const [a0, a1, n] = this.move.armor;
      if (this.mt >= a0 && this.mt <= a1 && this.armorUsed < n) {
        this.armorUsed++;
        const dmg = this.battle.noDamage(this) ? 0 : Math.round((hit.dmg || 0) * 0.5);
        this.hp = Math.max(this.battle.noKO(this) ? 1 : 0, this.hp - dmg);
        this.hitstop = src.proj ? Math.round(hs * 0.7) : hs;
        this.flash = 5;
        if (this.hp <= 0) { this.knockOut(att, hit, away); return 'hit'; }
        return 'armor';
      }
    }

    if (blocked) {
      const chip = Math.round(hit.chip || 0);
      if (chip && !this.battle.noDamage(this)) this.hp = Math.max(this.battle.noKO(this) ? 1 : 0, this.hp - chip);
      this.setState('blockstun', { stunT: hit.bs, lowStance: this.lowStance, blockFrom: away });
      this.pushV = away * (hit.push || 5) * 1.25;
      this.hitstop = src.proj ? Math.round(hs * 0.7) : hs;
      att.gainMeter((hit.meter || 4) * 0.5);
      this.gainMeter(2);
      if (this.hp <= 0) this.knockOut(att, hit, away);
      return 'block';
    }

    // 命中
    const counter = this.state === 'move' && this.move && this.move.type !== 'throw' && this.mt <= Math.max(this.move.lastActive, this.move.firstActive);
    const wasHurt = this.state === 'hitstun' || this.state === 'airHit' || this.state === 'dizzy' || this.state === 'thrown';
    if (!wasHurt) { this.combo = 0; this.comboDmg = 0; this.juggle = 0; }
    this.combo++;
    const scale = this.combo <= 2 ? 1 : Math.max(hit.superHit ? 0.7 : 0.5, 1 - 0.1 * (this.combo - 2));
    let dmg = Math.round((hit.dmg || 0) * scale * (counter ? 1.2 : 1));
    if (this.battle.noDamage(this)) dmg = 0;
    this.hp = Math.max(0, this.hp - dmg);
    this.comboDmg += dmg;
    this.lastDmg = dmg;
    this.counterHit = counter;
    this.stunIdle = 0;
    if (this.state === 'dizzy') { this.stun = 0; }
    else if (!this.pendingDizzy) {
      this.stun += (hit.stun || 0) * (counter ? 1.3 : 1);
      if (this.stun >= this.def.stunMax && !this.battle.noDamage(this)) { this.pendingDizzy = true; this.stun = this.def.stunMax; }
    }
    att.gainMeter(hit.meter ?? 6);
    this.gainMeter((hit.meter ?? 6) * 0.5);
    this.hitstop = src.proj ? Math.round(hs * 0.8) : hs;
    this.flash = FX.hitFlash;

    if (this.hp <= 0 && this.battle.noKO(this)) this.hp = 1;
    if (this.hp <= 0) { this.knockOut(att, hit, away); return 'hit'; }

    if (hit.kd || this.airborne || this.state === 'airHit') {
      const l = hit.launch || [3.5, 7];
      const kd = !!hit.kd || (this.state === 'airHit' && this.inKD);
      this.juggle++;
      this.setState('airHit', { airReset: !kd, inKD: kd, ko: false });
      this.vx = away * l[0];
      this.vy = l[1];
      this.y = Math.max(this.y, 0.01);
      this.pushV = 0;
    } else {
      const low = this.crouching || this.state === 'crouch';
      this.setState('hitstun', {
        stunT: (hit.hs || 15) + (counter ? 2 : 0),
        react: low ? 'hitLow' : hit.react === 'body' ? 'hitBody' : 'hitHigh',
        lowStance: low,
      });
      this.pushV = away * (hit.push || 5);
      this.vx = 0;
    }
    return 'hit';
  }

  knockOut(att, hit, away) {
    this.hp = 0;
    this.setState('airHit', { airReset: false, inKD: true, ko: true });
    this.vx = away * 4.5;
    this.vy = 13;
    this.y = Math.max(this.y, 0.01);
    this.pushV = 0;
    this.battle.onKO(this, att);
  }

  // ---------- 判定框 ----------
  frameInfo() {
    const d = this.def;
    let anim, idx, mass = false;
    const pick = (spec, prog) => {
      const n = spec.f.length;
      let i;
      if (spec.fps === 0) i = Math.min(n - 1, Math.floor(prog * n));
      else if (spec.loop) i = Math.floor((this.st * (spec.fps || 8)) / 60) % n;
      else i = Math.min(n - 1, Math.floor((this.st * (spec.fps || 8)) / 60));
      return [spec.a, spec.f[i]];
    };
    switch (this.state) {
      case 'move': {
        let acc = 0;
        let e = this.seq[this.seq.length - 1];
        for (const s of this.seq) { acc += s[1]; if (this.mt <= acc) { e = s; break; } }
        anim = e[2] || this.move.anim;
        idx = e[0];
        break;
      }
      case 'stand':
        if (this.guarding) [anim, idx] = pick(STATE_ANIMS.guardHi);
        else if (this.walk === 1) [anim, idx] = pick(STATE_ANIMS.walkF);
        else if (this.walk === -1) [anim, idx] = pick(STATE_ANIMS.walkB);
        else [anim, idx] = pick(STATE_ANIMS.idle);
        break;
      case 'intro': [anim, idx] = pick(STATE_ANIMS.idle); break;
      case 'crouch':
        if (this.guarding) [anim, idx] = pick(STATE_ANIMS.guardLo);
        else if (this.st < 3) [anim, idx] = pick(STATE_ANIMS.crouchDown);
        else [anim, idx] = pick(STATE_ANIMS.crouch);
        break;
      case 'prejump': [anim, idx] = pick(STATE_ANIMS.prejump); break;
      case 'air':
        [anim, idx] = pick(this.vy > 5 ? STATE_ANIMS.jumpUp : this.vy > -5 ? STATE_ANIMS.apex : STATE_ANIMS.fall);
        break;
      case 'landing':
        if (this.landSeq) {
          let acc = 0;
          let e = this.landSeq[this.landSeq.length - 1];
          for (const s of this.landSeq) { acc += s[1]; if (this.st <= acc) { e = s; break; } }
          anim = e[2] || this.landAnim;
          idx = e[0];
        } else [anim, idx] = pick(STATE_ANIMS.land);
        break;
      case 'blockstun': [anim, idx] = pick(this.lowStance ? STATE_ANIMS.blockLo : STATE_ANIMS.blockHi); break;
      case 'hitstun': [anim, idx] = pick(STATE_ANIMS[this.react] || STATE_ANIMS.hitHigh); break;
      case 'thrown': [anim, idx] = pick(this.y > 30 ? STATE_ANIMS.airFall : STATE_ANIMS.thrown); break;
      case 'airHit': [anim, idx] = pick(this.vy > 2 ? STATE_ANIMS.airHit : STATE_ANIMS.airFall); break;
      case 'knockdown': [anim, idx] = pick(this.st < 6 ? STATE_ANIMS.downSlam : STATE_ANIMS.down); break;
      case 'ko': [anim, idx] = pick(this.st < 6 ? STATE_ANIMS.downSlam : STATE_ANIMS.down); break;
      case 'getup': [anim, idx] = pick(STATE_ANIMS.getup, this.st / PHYS.getup); break;
      case 'dizzy': [anim, idx] = pick(STATE_ANIMS.dizzy); break;
      case 'win': [anim, idx] = pick(STATE_ANIMS.win, Math.min(1, this.st / 110)); break;
      case 'lose': [anim, idx] = pick(STATE_ANIMS.dizzy); break;
      default: [anim, idx] = pick(STATE_ANIMS.idle);
    }
    const mf = d.massFrames[anim];
    if (mf && mf.includes(idx) && this.airborne) mass = true;
    return { anim, idx, mass };
  }

  // 取得 sprite 影格（缺格時往前找最近的有效格）
  sprite(fi) {
    const atlas = ASSETS.chars[this.def.id];
    if (!atlas) return null;
    const list = atlas.anims[fi.anim];
    if (!list || !list.length) return null;
    for (let i = Math.min(fi.idx, list.length - 1); i >= 0; i--) if (list[i]) return list[i];
    return list.find((x) => x) || null;
  }

  // 世界單位 / atlas 像素
  // 世界單位 / atlas 像素（def.size：角色體型倍率，摔角手比較高大）
  get k() {
    const atlas = ASSETS.chars[this.def.id];
    return (LAYOUT.charH * (this.def.size || 1)) / (atlas ? atlas.standH : 360);
  }

  // 瞬移中看不見（也打不到）
  get invisible() {
    const v = this.state === 'move' && !this.lockFailed && this.move.invisible;
    if (!v) return false;
    const list = Array.isArray(v[0]) ? v : [v];
    return list.some(([a, b]) => this.mt >= a && this.mt <= b);
  }

  massY() {
    const atlas = ASSETS.chars[this.def.id];
    const f = atlas && atlas.anims.idle && atlas.anims.idle[0];
    return f ? (f.fy - f.cy) * this.k : 150;
  }

  // 把 sprite 錨點換算成世界座標的轉換參數
  spriteXform(fi, fr, y = this.y) {
    const adj = this.def.spriteAdj[fi.anim] || {};
    const k = this.k * (adj.s || 1);
    const ax = fi.mass ? fr.cx : fr.fx;
    const ay = fi.mass ? fr.cy : fr.fy;
    const baseY = y + (fi.mass ? this.massY() : 0) + (adj.dy || 0);
    return { k, ax, ay, baseY, dx: (adj.dx || 0) };
  }

  // 世界座標矩形 {x0,x1,y0,y1}（y 向上）
  rel(box, oy = this.y) {
    const [bx, by, bw, bh] = box;
    const a = this.x + this.facing * bx, b = this.x + this.facing * (bx + bw);
    return { x0: Math.min(a, b), x1: Math.max(a, b), y0: oy + by, y1: oy + by + bh };
  }

  hurtboxes() {
    const s = this.state;
    if (s === 'knockdown' || s === 'getup' || s === 'ko' || s === 'thrown' || s === 'intro' || s === 'win') return [];
    if (this.invuln('strike') || this.invisible || this.grabbed) return [];   // 投技演出中無敵
    const fi = this.frameInfo();
    const fr = this.sprite(fi);
    let body;
    if (fr) {
      const x = this.spriteXform(fi, fr);
      const top = x.baseY + x.ay * x.k;               // 影格頂端
      const bot = x.baseY - (fr.h - x.ay) * x.k;      // 影格底端
      const w = Math.min(46, Math.max(30, fr.w * x.k * 0.22));
      body = { x0: this.x - w, x1: this.x + w, y0: Math.max(this.y, bot), y1: top - 6 };
      if (s === 'airHit') body = { x0: this.x - 70, x1: this.x + 70, y0: bot, y1: top };
    } else {
      const h = this.airborne ? HURT.air : this.crouching ? HURT.crouch : HURT.stand;
      body = this.rel(h);
    }
    const list = [body];
    // 出招時伸出的手腳也會被打
    if (s === 'move' && this.move.hits) {
      for (const h of this.move.hits) {
        if (this.mt >= h.t[0] - 1 && this.mt <= h.t[1] + 6) {
          const r = this.hitRect(h);
          const shrink = 12;
          // limbHurt：武器招式只有靠近身體的一段會被打（棍尖打不到）
          const frac = this.move.limbHurt ?? 1;
          const len = (r.x1 - r.x0) * frac;
          const near = this.facing > 0 ? { x0: r.x0, x1: r.x0 + len } : { x0: r.x1 - len, x1: r.x1 };
          list.push({ x0: near.x0 + shrink, x1: near.x1 - shrink, y0: r.y0 + 6, y1: r.y1 - 6 });
        }
      }
    }
    return list;
  }

  invuln(kind) {
    if (this.state !== 'move' || !this.move.inv) return false;
    for (const [a, b, type] of this.move.inv) {
      if (this.mt >= a && this.mt <= b && (type === 'all' || type === kind)) return true;
    }
    return false;
  }

  // 攻擊判定：有 sprite 時依「出招影格的最前端肢體」自動對齊，否則用資料內的 box
  hitRect(h) {
    if (h.autoBox !== false && this.battle.autoBoxes) {
      const fr = this.hitFrame(h);
      if (fr) return fr;
    }
    return this.rel(h.box);
  }

  hitFrame(h) {
    // 找出判定開始那一 tick 顯示的影格
    let acc = 0, e = null;
    for (const s of this.seq) { acc += s[1]; if (h.t[0] <= acc) { e = s; break; } }
    if (!e) return null;
    const anim = e[2] || (this.move && this.move.anim);
    const atlas = ASSETS.chars[this.def.id];
    if (!atlas || !atlas.anims[anim]) return null;
    const fr = atlas.anims[anim][e[0]];
    if (!fr) return null;
    const fi = { anim, idx: e[0], mass: !!(this.def.massFrames[anim] && this.def.massFrames[anim].includes(e[0]) && this.airborne) };
    const x = this.spriteXform(fi, fr);
    const reach = Math.min(h.maxReach ?? Infinity, (fr.rx - x.ax) * x.k + x.dx);
    const [bx, , bw] = h.box;
    const len = Math.max(50, Math.min(bw, reach - bx));
    const y0 = x.baseY + (x.ay - fr.ry1) * x.k - 8;
    const y1 = x.baseY + (x.ay - fr.ry0) * x.k + 8;
    // 低段技保證貼地、判定高度至少 40
    const lo = h.guard === 'low' ? this.y : y0;
    const hi = Math.max(y1, lo + 40);
    const a = this.x + this.facing * (reach - len), b = this.x + this.facing * reach;
    return { x0: Math.min(a, b), x1: Math.max(a, b), y0: lo, y1: hi };
  }

  activeHits() {
    if (this.state !== 'move' || !this.move.hits || this.lockFailed) return [];
    const out = [];
    this.move.hits.forEach((h, i) => {
      if (this.hitDone.has(i)) return;
      if (this.mt >= h.t[0] && this.mt <= h.t[1]) out.push([i, h]);
    });
    return out;
  }

  pushbox() {
    const sz = this.def.size || 1;
    const h = (this.crouching ? 150 : this.state === 'knockdown' || this.state === 'ko' ? 40 : 250) * sz;
    const w = this.state === 'knockdown' || this.state === 'ko' || this.state === 'getup' || this.invisible ? 0 : (this.def.pushW || 34);
    return { x0: this.x - w, x1: this.x + w, y0: this.y, y1: this.y + h };
  }
}
