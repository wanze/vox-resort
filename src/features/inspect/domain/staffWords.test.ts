import { describe, expect, it } from 'vitest';
import type { StaffRole } from '../../sim/domain/staff';
import { pinTitle, staffName, taskWords, type TaskFacts } from './staffWords';

const facts = (parts: Partial<TaskFacts>): TaskFacts => ({
  kind: 'idle',
  working: false,
  role: 'cleaner',
  venue: null,
  lodging: null,
  ...parts,
});

describe('staffName', () => {
  it('numbers a worker from one within their role', () => {
    const roles: StaffRole[] = ['cleaner', 'cleaner', 'lifeguard', 'cleaner', 'lifeguard'];
    expect(staffName(roles, 0)).toBe('Cleaner 1');
    expect(staffName(roles, 3)).toBe('Cleaner 3');
    expect(staffName(roles, 4)).toBe('Lifeguard 2');
  });
});

describe('taskWords', () => {
  it('words the work at a venue by role', () => {
    const at = (role: StaffRole, venue: string): string =>
      taskWords(facts({ kind: 'venue', working: true, role, venue }));
    expect(at('cleaner', 'Restaurant')).toBe('Cleaning the Restaurant');
    expect(at('animator', 'Kids Club')).toBe('Putting on a show at the Kids Club');
    expect(at('lifeguard', 'Pool')).toBe('Watching the Pool');
    expect(at('mechanic', 'Game Hall')).toBe('Mending the Game Hall');
    expect(taskWords(facts({ kind: 'venue', venue: 'Bar' }))).toBe('On the way to the Bar');
  });

  it('says a worker sent by an order was sent', () => {
    expect(taskWords(facts({ kind: 'venue', venue: 'Bar', ordered: true }))).toBe(
      'Sent to the Bar',
    );
    expect(taskWords(facts({ kind: 'sweep', ordered: true }))).toBe('Sent to sweep a path');
    expect(taskWords(facts({ kind: 'venue', venue: 'Bar', ordered: true, working: true }))).toBe(
      'Cleaning the Bar',
    );
  });

  it('words every other task', () => {
    expect(taskWords(facts({ kind: 'sweep', working: true }))).toBe('Sweeping a path');
    expect(taskWords(facts({ kind: 'room', working: true, lodging: 'Villa' }))).toBe(
      'Making up a room at the Villa',
    );
    expect(taskWords(facts({ kind: 'restock', working: true }))).toBe('Restocking at the depot');
    expect(taskWords(facts({ kind: 'restock' }))).toBe('Fetching supplies');
    expect(taskWords(facts({ kind: 'tower', working: true, role: 'lifeguard' }))).toBe(
      'Watching the beach',
    );
    expect(taskWords(facts({ kind: 'idle' }))).toBe('Waiting for work');
    expect(taskWords(facts({ kind: 'home' }))).toBe('Going home');
    expect(taskWords(facts({ kind: 'off' }))).toBe('Off duty');
  });
});

describe('pinTitle', () => {
  it('runs the name into the task', () => {
    expect(pinTitle('Cleaner 7', 'Sweeping a path')).toBe('Cleaner 7, sweeping a path');
  });
});
