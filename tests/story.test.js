import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, update } from '../src/story.js';

function advance(state, seconds) {
  for (let index = 0; index < seconds * 4; index++) state = update(state, { type: 'TICK', seconds: .25 });
  return state;
}

function explore() { return advance(initialState(true), 9); }

test('photo can be viewed repeatedly but the back clue is acquired once', () => {
  let state = update(explore(), { type: 'PHOTO' });
  const firstLine = state.line;
  for (let index = 0; index < 10; index++) state = update(state, { type: 'PHOTO' });
  assert.equal(state.photoInspected, true);
  assert.equal(state.photoMessageRead, false);
  assert.equal(state.line, firstLine);
  state = update(state, { type: 'FLIP_PHOTO' });
  assert.equal(state.photoMessageRead, true);
  assert.equal(state.lineId, 'photo_back');
  assert.deepEqual(update(state, { type: 'FLIP_PHOTO' }), state);
});

test('two discovered clues change the knock line and can trigger it early', () => {
  let state = update(explore(), { type: 'PHOTO' });
  state = update(state, { type: 'FLIP_PHOTO' });
  state = update(state, { type: 'CLOSE_PANEL' });
  state = update(state, { type: 'WINDOW' });
  state = advance(state, 15);
  assert.equal(state.phase, 'explore');
  state = update(state, { type: 'CLOSE_PANEL' });
  state = advance(state, .25);
  assert.equal(state.phase, 'knock');
  assert.equal(state.lineId, 'knock_both');
  assert.deepEqual(update(state, { type: 'KNOCK' }), state);
});

test('pause freezes dialogue and resolution time, then resumes', () => {
  let state = explore();
  state = update(state, { type: 'KNOCK' });
  state = update(state, { type: 'DECIDE', choice: 'wait' });
  state = update(state, { type: 'PAUSE' });
  const elapsed = state.elapsed;
  state = advance(state, 10);
  assert.equal(state.elapsed, elapsed);
  assert.equal(state.phase, 'resolution');
  state = update(state, { type: 'RESUME' });
  state = advance(state, 7);
  assert.equal(state.phase, 'ending');
});

test('door is blocked before knock and choices lead to different consequences', () => {
  let state = update(explore(), { type: 'DOOR' });
  assert.equal(state.phase, 'explore');
  state = update(state, { type: 'KNOCK' });
  const open = update(state, { type: 'DECIDE', choice: 'open' });
  const wait = update(state, { type: 'DECIDE', choice: 'wait' });
  assert.notEqual(open.line, wait.line);
  assert.equal(open.ending, 'open');
  assert.equal(wait.ending, 'wait');
});

test('restart clears all clues and restores the opening', () => {
  let state = update(explore(), { type: 'PHOTO' });
  state = update(state, { type: 'FLIP_PHOTO' });
  state = update(state, { type: 'RESTART' });
  assert.equal(state.photoInspected, false);
  assert.equal(state.photoMessageRead, false);
  assert.equal(state.knockHeard, false);
  assert.equal(state.phase, 'intro');
  assert.equal(state.lineId, 'opening');
});
