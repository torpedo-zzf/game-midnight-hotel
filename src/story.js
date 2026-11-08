export function initialState(started = false) {
  return {
    started,
    phase: started ? 'intro' : 'title',
    elapsed: 0,
    paused: false,
    panel: null,
    photoInspected: false,
    photoMessageRead: false,
    windowInspected: false,
    knockHeard: false,
    ending: null,
    resolutionUntil: null,
    mood: 'calm',
    line: started ? '你醒了？别出声。这里的墙很薄。' : '',
    lineId: started ? 'opening' : null,
    speaker: started ? 'Mira' : '',
    lineUntil: started ? 5 : 0
  };
}

function say(state, speaker, line, lineId, seconds = 6) {
  return { ...state, speaker, line, lineId, lineUntil: state.elapsed + seconds };
}

function knockLine(state) {
  if (state.photoMessageRead && state.windowInspected) return ['照片上的警告是真的。窗外的人已经到了门口。', 'knock_both'];
  if (state.photoMessageRead) return ['他们来找这张照片了。别让他们看到背面的字。', 'knock_photo'];
  if (state.windowInspected) return ['窗外那个人不见了。现在有人敲门。', 'knock_window'];
  return ['有人来了。别让他们知道我们在这里。', 'knock'];
}

function endingLine(state, choice) {
  if (choice === 'open') {
    if (state.photoMessageRead) return '你把照片举到门缝前。门外的守卫僵住了：“这张照片里，为什么有我？”';
    if (state.windowInspected) return '门外的守卫穿着湿透的雨衣。正是刚才站在窗下的人。';
    return '门开了一条缝。守卫不看 Mira，只盯着你问：“照片在哪？”';
  }
  if (state.photoMessageRead) return '你把照片藏起。门外忽然传来 Mira 的声音：“开门，是我。”身旁的 Mira 握住你的手。';
  if (state.windowInspected) return '你没有开门。窗下的人影重新出现，这一次，正抬头看着你。';
  return '你没有开门。脚步声离开，却停在了窗外。';
}

export function update(state, action) {
  switch (action.type) {
    case 'START':
      return initialState(true);
    case 'TICK': {
      if (!state.started || state.paused || state.phase === 'ending') return state;
      let next = { ...state, elapsed: state.elapsed + Math.min(Math.max(action.seconds || 0, 0), 0.25) };
      if (next.phase === 'intro' && next.elapsed >= 9) {
        next = say({ ...next, phase: 'explore' }, 'Mira', '先看看房间。也许能找到他们遗漏的东西。', 'explore', 6);
      }
      if (next.phase === 'explore' && !next.panel && (next.elapsed >= 40 || (next.photoMessageRead && next.windowInspected && next.elapsed >= 24))) {
        return update(next, { type: 'KNOCK' });
      }
      if (next.phase === 'resolution' && next.elapsed >= next.resolutionUntil) return { ...next, phase: 'ending' };
      if (next.line && next.elapsed >= next.lineUntil) next = { ...next, line: '', lineId: null, speaker: '' };
      return next;
    }
    case 'PHOTO': {
      if (state.phase !== 'explore' && state.phase !== 'knock') return state;
      if (state.photoInspected) return { ...state, panel: 'photo' };
      return say({ ...state, panel: 'photo', photoInspected: true, mood: 'tense' }, 'Mira', '照片里那个人是我。可他们说，我七年前就死了。', 'photo', 7);
    }
    case 'FLIP_PHOTO':
      if (state.panel !== 'photo' || state.photoMessageRead) return state;
      return say({ ...state, photoMessageRead: true }, 'Mira', '照片背面写着，三零七，别相信敲门的人。', 'photo_back', 7);
    case 'WINDOW':
      if (state.phase !== 'explore' && state.phase !== 'knock') return state;
      if (state.windowInspected) return { ...state, panel: 'window' };
      return say({ ...state, panel: 'window', windowInspected: true }, 'Mira', '楼下有个人影。雨这么大，他却一直盯着三楼。', 'window', 7);
    case 'CLOSE_PANEL':
      return { ...state, panel: null };
    case 'DOOR':
      if (state.phase !== 'explore' && state.phase !== 'knock') return state;
      if (state.phase === 'explore') {
        if (state.elapsed >= 15) return update(state, { type: 'KNOCK' });
        return say(state, 'Mira', '先别开。我们还不知道走廊里是谁。', 'door_early', 6);
      }
      return { ...state, panel: 'door' };
    case 'KNOCK': {
      if (state.knockHeard || state.phase === 'ending' || state.phase === 'resolution') return state;
      const [line, lineId] = knockLine(state);
      return say({ ...state, phase: 'knock', knockHeard: true, mood: 'tense', panel: null }, 'Mira', line, lineId, 8);
    }
    case 'DECIDE': {
      if (state.phase !== 'knock' || !['open', 'wait'].includes(action.choice)) return state;
      const ending = action.choice;
      return say({ ...state, phase: 'resolution', ending, panel: null, mood: ending === 'open' ? 'surprised' : 'tense', resolutionUntil: state.elapsed + 7 }, '叙述', endingLine(state, ending), null, 1000);
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
