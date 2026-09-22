import { EngagementNotificationType as T } from '../entities/engagement-notification.entity';
import { ENGAGEMENT_MESSAGES } from './engagement-messages';
import { pickMessage, render } from './engagement-notifications.service';

describe('engagement messages', () => {
  it('has at least one variant per campaign, with unique keys', () => {
    const keys = new Set<string>();
    for (const type of Object.values(T)) {
      const pool = ENGAGEMENT_MESSAGES[type];
      expect(pool.length).toBeGreaterThan(0);
      for (const m of pool) {
        expect(keys.has(m.key)).toBe(false);
        expect(m.key.length).toBeLessThanOrEqual(60);
        keys.add(m.key);
      }
    }
  });

  it('never repeats the previous variant when alternatives exist', () => {
    const pool = ENGAGEMENT_MESSAGES[T.DRIVER_MORNING];
    for (let i = 0; i < 50; i++) {
      expect(pickMessage(T.DRIVER_MORNING, pool[0].key).key).not.toBe(pool[0].key);
    }
  });

  it('fills placeholders and drops {name} cleanly when missing', () => {
    expect(render('Mirëmëngjes, {name}!', { name: 'Arben' })).toBe('Mirëmëngjes, Arben!');
    expect(render('Mirëmëngjes, {name}!', { name: null })).toBe('Mirëmëngjes!');
    expect(render('Kudo që të shkosh, {name}, një taksi', { name: ' ' })).toBe(
      'Kudo që të shkosh, një taksi',
    );
    expect(render('{online} nga {total}', { name: null, vars: { online: 3, total: 5 } })).toBe(
      '3 nga 5',
    );
  });

  it('leaves no unfilled placeholders in any rendered template', () => {
    const vars = { rides: 1, amount: '1', online: 1, total: 2 };
    for (const type of Object.values(T)) {
      for (const m of ENGAGEMENT_MESSAGES[type]) {
        expect(render(m.title + m.body, { name: 'X', vars })).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
