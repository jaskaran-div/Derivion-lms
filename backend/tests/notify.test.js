const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { installMockModule } = require('./helpers/mocks');

installMockModule(require.resolve('../src/config/database'), {});
const { recipientsFor } = require('../src/services/notify');

describe('notification email recipients', () => {
  it('emails a school learner\'s guardian, never the internal placeholder address', () => {
    const to = recipientsFor({ role: 'STUDENT', email: 'manvi.09@students.derivion.local', guardianEmail: 'parent@example.com' });
    assert.deepEqual(to, [{ to: 'parent@example.com', forGuardian: true }]);
  });

  it('emails an individual learner directly, plus a different guardian address', () => {
    assert.deepEqual(recipientsFor({ role: 'STUDENT', email: 'a@example.com', guardianEmail: null }), [{ to: 'a@example.com', forGuardian: false }]);
    assert.equal(recipientsFor({ role: 'STUDENT', email: 'a@example.com', guardianEmail: 'A@example.com' }).length, 1);
  });

  it('emails teachers and admins at their own address only', () => {
    assert.deepEqual(recipientsFor({ role: 'TEACHER', email: 't@school.in', guardianEmail: 'x@y.z' }), [{ to: 't@school.in', forGuardian: false }]);
  });

  it('sends nothing when a learner has neither a real email nor a guardian email', () => {
    assert.deepEqual(recipientsFor({ role: 'STUDENT', email: 'x.12@students.derivion.local', guardianEmail: null }), []);
  });
});
