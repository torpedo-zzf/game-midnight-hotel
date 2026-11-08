import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, update } from '../src/story.js';

function explore() {
  let state = initialState(true);
  for (let index = 0; index < 36; index++) state = update(state, { type: 'TICK', seconds: .25 });
  return state;
}

test('photo clue is awarded once and changes the door ending', () => {
  let state = explore();
  state = update(state, { type: 'PHOTO' });
  const firstLine = state.line;
  for (let index = 0; index < 10; index++) state = update(state, { type: 'PHOTO' });
  assert.equal(state.photoInspected, true);
  assert.equal(state.line, firstLine);
  state = update(state, { type: 'KNOCK' });
  state = update(state, { type: 'DECIDE', choice: 'open' });
  assert.match(state.line, /照片/);
  assert.equal(state.ending, 'open');
});

test('pause freezes story time and resumes from the same point', () => {
  let state = explore();
  state = update(state, { type: 'PAUSE' });
  const elapsed = state.elapsed;
  state = update(state, { type: 'TICK', seconds: 100 });
  assert.equal(state.elapsed, elapsed);
  state = update(state, { type: 'RESUME' });
  state = update(state, { type: 'TICK', seconds: 0.1 });
  assert.ok(state.elapsed > elapsed);
});

test('door cannot be opened before the knock; branch choices differ', () => {
  let state = explore();
  state = update(state, { type: 'DOOR' });
  assert.equal(state.phase, 'explore');
  state = update(state, { type: 'KNOCK' });
  const open = update(state, { type: 'DECIDE', choice: 'open' });
  const wait = update(state, { type: 'DECIDE', choice: 'wait' });
  assert.notEqual(open.line, wait.line);
  assert.notEqual(open.ending, wait.ending);
});

test('restart clears this run and duplicate knocks do not repeat', () => {
  let state = update(explore(), { type: 'KNOCK' });
  assert.deepEqual(update(state, { type: 'KNOCK' }), state);
  state = update(state, { type: 'PHOTO' });
  state = update(state, { type: 'RESTART' });
  assert.equal(state.photoInspected, false);
  assert.equal(state.knockHeard, false);
  assert.equal(state.phase, 'intro');
});
