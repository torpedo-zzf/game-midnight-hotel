export function initialState(started = false) {
  return {
    started,
    phase: started ? 'intro' : 'title',
    elapsed: 0,
    paused: false,
    panel: null,
    photoInspected: false,
    windowInspected: false,
    knockHeard: false,
    ending: null,
    mood: 'calm',
    line: started ? '你醒了？别出声。这里的墙很薄。' : '',
    speaker: started ? 'Mira' : '',
    lineUntil: started ? 9 : 0
  };
}

function say(state, speaker, line, seconds = 7) {
  return { ...state, speaker, line, lineUntil: state.elapsed + seconds };
}

export function update(state, action) {
  switch (action.type) {
    case 'START':
      return initialState(true);
    case 'TICK': {
      if (!state.started || state.paused || state.phase === 'ending') return state;
      let next = { ...state, elapsed: state.elapsed + Math.min(Math.max(action.seconds || 0, 0), 0.25) };
      if (next.phase === 'intro' && next.elapsed >= 9) {
        next = say({ ...next, phase: 'explore' }, '', '先看看房间。照片、窗户和房门都可以检查。', 7);
      }
      if (next.phase === 'explore' && next.elapsed >= 40) return update(next, { type: 'KNOCK' });
      if (next.line && next.elapsed >= next.lineUntil) next = { ...next, line: '', speaker: '' };
      return next;
    }
    case 'PHOTO': {
      if (state.phase !== 'explore' && state.phase !== 'knock') return state;
      if (state.photoInspected) return { ...state, panel: 'photo' };
      return say({ ...state, panel: 'photo', photoInspected: true, mood: 'tense' }, 'Mira', '那张照片……我以为他们已经把它烧了。', 7);
    }
    case 'WINDOW':
      if (state.phase !== 'explore' && state.phase !== 'knock') return state;
      return { ...state, panel: 'window', windowInspected: true };
    case 'CLOSE_PANEL':
      return { ...state, panel: null };
    case 'DOOR':
      if (state.phase === 'intro' || state.phase === 'ending') return state;
      if (state.phase === 'explore') {
        if (state.elapsed >= 15) return update(state, { type: 'KNOCK' });
        return say(state, 'Mira', '先别开。我们还不知道走廊里是谁。', 6);
      }
      return { ...state, panel: 'door' };
    case 'KNOCK':
      if (state.knockHeard || state.phase === 'ending') return state;
      return say({ ...state, phase: 'knock', knockHeard: true, mood: 'tense', panel: null }, 'Mira', state.photoInspected
        ? '门外的人在找这张照片。你看过它，现在由你决定。'
        : '有人来了。别让他们知道我们在这里。', 9);
    case 'DECIDE': {
      if (state.phase !== 'knock' || !['open', 'wait'].includes(action.choice)) return state;
      const ending = action.choice === 'open' ? 'open' : 'wait';
      const line = ending === 'open'
        ? (state.photoInspected ? '你握着照片走向门口。Mira 终于说出了那个房间号。' : '门开了一道缝。Mira 后退一步，压低了声音。')
        : (state.photoInspected ? '你把照片藏起。脚步声渐远，Mira 对你点了点头。' : '你没有开门。敲门声停了，走廊却仍有人呼吸。');
      return say({ ...state, phase: 'ending', ending, panel: null, mood: ending === 'open' ? 'surprised' : 'calm' }, '结局', line, 1000);
    }
    case 'PAUSE':
      return state.started && state.phase !== 'ending' ? { ...state, paused: true, panel: null } : state;
    case 'RESUME':
      return { ...state, paused: false };
    case 'RESTART':
      return initialState(true);
    default:
      return state;
  }
}
