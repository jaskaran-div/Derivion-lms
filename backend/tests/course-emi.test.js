const assert = require('node:assert/strict');
const Module = require('node:module');
const { after, beforeEach, describe, it } = require('node:test');

const orderRequests = [];
const prisma = {
  course: {},
  enrollment: {},
  user: {},
  payment: {},
};

const installMockModule = (modulePath, exportsValue) => {
  const mockModule = new Module(modulePath);
  mockModule.filename = modulePath;
  mockModule.loaded = true;
  mockModule.exports = exportsValue;
  require.cache[modulePath] = mockModule;
};

installMockModule(require.resolve('../src/config/database'), prisma);
installMockModule(require.resolve('../src/config/aws'), {});
installMockModule(require.resolve('../src/config/email'), {
  sendEmail: () => {},
  emailTemplates: {},
});
installMockModule(require.resolve('razorpay'), class MockRazorpay {
  constructor() {
    this.orders = {
      create: async (options) => {
        orderRequests.push(options);
        return { id: `order_${orderRequests.length}`, ...options };
      },
    };
  }
});

const { createCourse, updateCourse } = require('../src/controllers/courseController');
const { createOrder } = require('../src/controllers/paymentController');

const envKeys = [
  'RAZORPAY_CONFIG_STANDARD',
  'RAZORPAY_CONFIG_EMI',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

let storedCourse;
let lastCourseUpdate;

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const createCoursePayload = (overrides = {}) => ({
  title: 'Course title',
  description: 'A sufficiently long course description.',
  categoryId: 'category-1',
  price: 10000,
  ...overrides,
});

describe('course EMI eligibility', () => {
  beforeEach(() => {
    orderRequests.length = 0;
    lastCourseUpdate = null;
    storedCourse = {
      id: 'course-1',
      title: 'Existing title',
      description: 'Existing description',
      price: 200000,
      discountPrice: null,
      isFree: false,
      status: 'PUBLISHED',
      thumbnail: 'existing-thumbnail.jpg',
      emiEnabled: false,
    };

    prisma.course.create = async ({ data }) => ({ id: 'created-course', ...data });
    prisma.course.update = async ({ data }) => {
      lastCourseUpdate = data;
      storedCourse = { ...storedCourse, ...data };
      return storedCourse;
    };
    prisma.course.findUnique = async () => storedCourse;
    prisma.enrollment.findUnique = async () => null;
    prisma.enrollment.create = async ({ data }) => data;
    prisma.user.findUnique = async () => ({
      email: 'student@example.test',
      firstName: 'Test',
      lastName: 'Student',
      phone: '9000000000',
    });
    prisma.payment.create = async ({ data }) => data;

    process.env.RAZORPAY_CONFIG_STANDARD = 'config_TniERfRtPJaKjZ';
    process.env.RAZORPAY_CONFIG_EMI = 'config_TniFJkBEcjWygb';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
    process.env.RAZORPAY_KEY_SECRET = 'test-secret';
  });

  it('creates courses with EMI disabled by default', async () => {
    const res = response();
    await createCourse({ body: createCoursePayload() }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.emiEnabled, false);
  });

  it('creates EMI-enabled courses only when explicitly requested', async () => {
    const res = response();
    await createCourse({ body: createCoursePayload({ emiEnabled: true }) }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.emiEnabled, true);
  });

  it('rejects non-Boolean EMI values on create and update', async () => {
    const createRes = response();
    await createCourse({ body: createCoursePayload({ emiEnabled: 'true' }) }, createRes);
    assert.equal(createRes.statusCode, 400);

    const updateRes = response();
    await updateCourse({ params: { id: storedCourse.id }, body: { emiEnabled: 1 } }, updateRes);
    assert.equal(updateRes.statusCode, 400);
    assert.equal(lastCourseUpdate, null);
  });

  it('updates only the EMI field, preserving unrelated course data', async () => {
    const onRes = response();
    await updateCourse({ params: { id: storedCourse.id }, body: { emiEnabled: true } }, onRes);
    assert.equal(onRes.statusCode, 200);
    assert.deepEqual(lastCourseUpdate, { emiEnabled: true });
    assert.equal(storedCourse.status, 'PUBLISHED');
    assert.equal(storedCourse.price, 200000);
    assert.equal(storedCourse.thumbnail, 'existing-thumbnail.jpg');

    const offRes = response();
    await updateCourse({ params: { id: storedCourse.id }, body: { emiEnabled: false } }, offRes);
    assert.equal(offRes.statusCode, 200);
    assert.equal(storedCourse.emiEnabled, false);
    assert.equal(storedCourse.title, 'Existing title');
  });

  it('rejects an invalid course ID before querying the database', async () => {
    let queried = false;
    prisma.course.findUnique = async () => {
      queried = true;
      return storedCourse;
    };

    const res = response();
    await createOrder({ body: { courseId: '' }, user: { id: 'student-1' } }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(queried, false);
  });

  it('rejects a missing or unpublished course', async () => {
    prisma.course.findUnique = async () => null;
    const res = response();
    await createOrder({ body: { courseId: 'missing-course' }, user: { id: 'student-1' } }, res);

    assert.equal(res.statusCode, 404);
    assert.equal(orderRequests.length, 0);
  });

  it('selects the standard configuration using the stored setting, not browser input or price', async () => {
    const res = response();
    await createOrder({
      body: {
        courseId: storedCourse.id,
        price: 1,
        checkout_config_id: 'attacker-selected-config',
        emiEnabled: true,
      },
      user: { id: 'student-1' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(orderRequests[0].amount, 20000000);
    assert.equal(orderRequests[0].checkout_config_id, 'config_TniERfRtPJaKjZ');
    assert.equal(res.body.data.checkoutConfigId, 'config_TniERfRtPJaKjZ');
  });

  it('selects the EMI configuration for an EMI-enabled course', async () => {
    storedCourse.emiEnabled = true;
    const res = response();
    await createOrder({ body: { courseId: storedCourse.id }, user: { id: 'student-1' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(orderRequests[0].checkout_config_id, 'config_TniFJkBEcjWygb');
    assert.equal(res.body.data.checkoutConfigId, 'config_TniFJkBEcjWygb');
  });

  it('does not create an order when the saved course configuration is missing', async () => {
    delete process.env.RAZORPAY_CONFIG_STANDARD;
    const res = response();
    await createOrder({ body: { courseId: storedCourse.id }, user: { id: 'student-1' } }, res);

    assert.equal(res.statusCode, 503);
    assert.equal(orderRequests.length, 0);
  });
});

after(() => {
  envKeys.forEach((key) => {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  });
});
