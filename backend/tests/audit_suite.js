const axios = require('axios');
const prisma = require('../src/config/database');
const crypto = require('crypto');

const BASE_URL = 'http://localhost:5000/api';
const client = axios.create({ baseURL: BASE_URL, validateStatus: () => true });

const testResults = [];

function recordTest(name, passed, details) {
  testResults.push({ name, passed, details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}: ${details}`);
}

async function runAudit() {
  console.log('====================================================');
  console.log('   DERIVION LMS — PRODUCTION READINESS AUDIT SUITE  ');
  console.log('====================================================\n');

  try {
    // ----------------------------------------------------
    // 1. Health Check
    // ----------------------------------------------------
    const health = await client.get('/health');
    recordTest('System Health Endpoint', health.status === 200, `Status: ${health.status}`);

    // ----------------------------------------------------
    // 2. Authentication & Sessions
    // ----------------------------------------------------
    // Test 2.1: Register new user
    const testEmail = `audit_student_${Date.now()}@example.com`;
    const regRes = await client.post('/auth/register', {
      email: testEmail,
      password: 'AuditPassword@123',
      firstName: 'Audit',
      lastName: 'Student',
      phone: '9876543210',
    });
    recordTest('User Registration', regRes.status === 201, `Status: ${regRes.status}`);

    const newTokens = regRes.data?.data;

    // Test 2.2: Refresh token immediately after register (DEFECT 1 CHECK)
    if (newTokens?.refreshToken) {
      const refRes = await client.post('/auth/refresh', { refreshToken: newTokens.refreshToken });
      recordTest(
        'Immediate Refresh After Registration (Fix 1 Verified)',
        refRes.status === 200,
        `Status: ${refRes.status}, message: ${refRes.data?.message || 'OK'}`
      );
    }

    // Test 2.3: Admin Login
    const adminLoginRes = await client.post('/auth/login', {
      email: 'admin@derivion.com',
      password: 'Admin@123',
    });
    recordTest('Admin Login', adminLoginRes.status === 200, `Status: ${adminLoginRes.status}`);
    const adminToken = adminLoginRes.data?.data?.accessToken;

    // Test 2.4: Refresh token rotation and reuse prevention
    if (adminLoginRes.data?.data?.refreshToken) {
      const origRefresh = adminLoginRes.data.data.refreshToken;
      const rotate1 = await client.post('/auth/refresh', { refreshToken: origRefresh });
      recordTest('Refresh Token Rotation Issue New Tokens', rotate1.status === 200, `Status: ${rotate1.status}`);

      // Attempt reuse of old refresh token
      const rotate2 = await client.post('/auth/refresh', { refreshToken: origRefresh });
      recordTest(
        'Reused Refresh Token Rejection',
        rotate2.status === 401,
        `Status: ${rotate2.status} (expected 401 revoked)`
      );
    }

    // Test 2.5: Logout token revocation
    if (newTokens?.refreshToken) {
      const logoutLogin = await client.post('/auth/login', {
        email: testEmail,
        password: 'AuditPassword@123',
      });
      const logoutRefresh = logoutLogin.data?.data?.refreshToken;
      await client.post('/auth/logout', { refreshToken: logoutRefresh });
      const postLogoutRef = await client.post('/auth/refresh', { refreshToken: logoutRefresh });
      recordTest(
        'Logout Revokes Refresh Token',
        postLogoutRef.status === 401,
        `Status: ${postLogoutRef.status} (expected 401)`
      );
    }

    // ----------------------------------------------------
    // 3. Multi-Tenancy Isolation
    // ----------------------------------------------------
    const schoolACode = `SCHA${Date.now().toString().slice(-4)}`;
    const schoolBCode = `SCHB${Date.now().toString().slice(-4)}`;

    const createSchA = await client.post(
      '/admin/schools',
      { name: 'School Alpha', code: schoolACode },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const createSchB = await client.post(
      '/admin/schools',
      { name: 'School Beta', code: schoolBCode },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    const schoolA = createSchA.data?.data;
    const schoolB = createSchB.data?.data;
    recordTest('Create Multi-Schools', !!(schoolA?.id && schoolB?.id), `School A: ${schoolA?.code}, School B: ${schoolB?.code}`);

    // Assign a student specifically to School B
    const dummyStudentB = await prisma.user.create({
      data: {
        email: `student_schb_${Date.now()}@derivion.local`,
        firstName: 'Student',
        lastName: 'Beta',
        password: 'Password@123',
        role: 'STUDENT',
      },
    });
    await prisma.schoolMembership.create({
      data: { schoolId: schoolB.id, userId: dummyStudentB.id, role: 'STUDENT' },
    });

    // Test 3.1: School Analytics Endpoint Parameter (DEFECT 2 CHECK)
    // School A has 0 students. School B has 1 student. School A analytics MUST report 0, not 1!
    if (schoolA?.id) {
      const schAnalyticsRes = await client.get(`/admin/schools/${schoolA.id}/analytics`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const totalStudentsInSchA = schAnalyticsRes.data?.data?.summary?.totalStudents;
      recordTest(
        'School Analytics Scoped to Specific School (Fix 2 Verified)',
        schAnalyticsRes.status === 200 && totalStudentsInSchA === 0,
        `Status: ${schAnalyticsRes.status}, reported students in School A: ${totalStudentsInSchA} (School B has ${1})`
      );
    }

    // Clean up dummy student B
    await prisma.user.delete({ where: { id: dummyStudentB.id } }).catch(() => {});

    // ----------------------------------------------------
    // 4. Payment Webhook Security
    // ----------------------------------------------------
    // Test 4.1: Unsigned Webhook Request (DEFECT 3 CHECK)
    const unsignedWebhookRes = await client.post('/payments/webhook', {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_fake_123', order_id: 'order_fake_123' } } },
    });
    recordTest(
      'Unsigned Webhook Request Rejection (Fix 3 Verified)',
      unsignedWebhookRes.status === 401,
      `Status: ${unsignedWebhookRes.status} (expected 401 rejected)`
    );

    // ----------------------------------------------------
    // 5. Bulk Student Import & Credential Persistence
    // ----------------------------------------------------
    const teacherLogin = await client.post('/auth/login', {
      email: 'teacher@derivion.com',
      password: 'Teacher@123',
    });
    const teacherToken = teacherLogin.data?.data?.accessToken;

    const uniquePhone = `91${Date.now().toString().slice(-8)}`;
    const csvDataPhoneOnly = [
      'firstName,lastName,guardianEmail,guardianPhone,courseIds',
      `AuditStudentPhone,Test,,${uniquePhone},`,
    ].join('\n');

    const import1 = await client.post(
      '/teacher/students/import',
      { csvData: csvDataPhoneOnly, schoolId: schoolA?.id },
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    recordTest('Bulk Import Initial Run', import1.status === 200, `Status: ${import1.status}`);

    const jobId1 = import1.data?.data?.jobId;

    // Test 5.2: Re-import same data - should detect duplicate and skip (DEFECT 6 CHECK)
    const import2 = await client.post(
      '/teacher/students/import',
      { csvData: csvDataPhoneOnly, schoolId: schoolA?.id },
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    const skippedCount = import2.data?.data?.skippedCount;
    recordTest(
      'Bulk Import Re-import Duplicate Detection Without Email (Fix 6 Verified)',
      skippedCount > 0,
      `Skipped count: ${skippedCount} (expected > 0)`
    );

    // Test 5.3: Check if plaintext password is saved in DB studentImportJob (DEFECT 4 CHECK)
    if (jobId1) {
      const getJobRes = await client.get(`/teacher/students/import/jobs/${jobId1}`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      const persistedResults = getJobRes.data?.data?.results;
      const hasPlainPasswordInDB = Array.isArray(persistedResults) && persistedResults.some(r => r.password && r.password !== '********');
      recordTest(
        'Temporary Passwords Masked in Persistent Job Record (Fix 4 Verified)',
        !hasPlainPasswordInDB,
        `Plain password exposed in stored job: ${hasPlainPasswordInDB}`
      );
    }

    // ----------------------------------------------------
    // 6. CSV Formula Injection in Analytics Export
    // ----------------------------------------------------
    const formulaStudent = await prisma.user.create({
      data: {
        email: `formula_${Date.now()}@test.local`,
        firstName: '=cmd|’ /C calc’!A0',
        lastName: '+SUM(1+1)',
        password: 'HashedPassword123!',
        role: 'STUDENT',
      },
    });

    const exportRes = await client.get('/admin/analytics/export/students', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const csvContent = exportRes.data;
    const hasUnescapedFormula = csvContent && (csvContent.includes('\n=cmd') || csvContent.includes(',=cmd') || csvContent.includes('\n+SUM') || csvContent.includes(',+SUM'));
    recordTest(
      'CSV Export Formula Injection Neutralized (Fix 5 Verified)',
      !hasUnescapedFormula,
      `Unescaped formula present in CSV: ${hasUnescapedFormula}`
    );

    // Clean up formula user
    await prisma.user.delete({ where: { id: formulaStudent.id } }).catch(() => {});

    // ----------------------------------------------------
    // 7. Learning Workflow & Certificate Auto-Issuance
    // ----------------------------------------------------
    // Create a demo course with a section and a lesson
    let category = await prisma.category.findFirst();
    if (!category) {
      category = await prisma.category.create({
        data: { name: 'Audit Category', slug: `audit-cat-${Date.now()}` },
      });
    }

    const testCourse = await prisma.course.create({
      data: {
        title: `Audit Test Course ${Date.now()}`,
        slug: `audit-test-course-${Date.now()}`,
        description: 'Test course description for audit',
        status: 'PUBLISHED',
        isFree: true,
        price: 0,
        categoryId: category.id,
      },
    });
    const testSection = await prisma.section.create({
      data: { title: 'Section 1', courseId: testCourse.id, order: 0 },
    });
    const testContent = await prisma.content.create({
      data: {
        title: 'Lesson 1',
        sectionId: testSection.id,
        type: 'VIDEO',
        order: 0,
        isPublished: true,
        duration: 60,
      },
    });

    // Login as a student
    const studentLogin = await client.post('/auth/login', {
      email: 'student@derivion.com',
      password: 'Student@123',
    });
    const studentToken = studentLogin.data?.data?.accessToken;
    const studentUser = studentLogin.data?.data?.user;

    // Enroll student in test course
    await client.post('/payments/create-order', { courseId: testCourse.id }, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    // Update progress to 100% and completed
    const progressRes = await client.post(
      `/courses/student/content/${testContent.id}/progress`,
      { watchedSeconds: 60, lastPosition: 60, isCompleted: true },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    recordTest('Progress Update to 100%', progressRes.status === 200, `Status: ${progressRes.status}`);

    // Verify certificate was automatically issued
    const issuedCert = await prisma.certificate.findUnique({
      where: { userId_courseId: { userId: studentUser.id, courseId: testCourse.id } },
    });
    recordTest(
      'Certificate Auto-Issued Upon 100% Course Completion (Fix 7 Verified)',
      !!issuedCert && !!issuedCert.certificateNo,
      `Certificate No: ${issuedCert?.certificateNo || 'None'}`
    );

    // Public certificate verification
    if (issuedCert) {
      const verifyRes = await client.get(`/courses/verify/${issuedCert.certificateNo}`);
      recordTest(
        'Public Certificate Verification Endpoint',
        verifyRes.status === 200 && verifyRes.data?.data?.isValid === true,
        `Status: ${verifyRes.status}, Recipient: ${verifyRes.data?.data?.recipientName}`
      );
    }

    // Clean up test course
    await prisma.course.delete({ where: { id: testCourse.id } }).catch(() => {});

    // Test non-existent certificate
    const dummyVerify = await client.get('/courses/verify/NON_EXISTENT_CERT');
    recordTest(
      'Non-existent Certificate Verification Returns 404',
      dummyVerify.status === 404,
      `Status: ${dummyVerify.status}`
    );

  } catch (error) {
    console.error('Audit suite encountered error:', error);
  } finally {
    console.log('\n====================================================');
    console.log('AUDIT SUMMARY:');
    const total = testResults.length;
    const passed = testResults.filter(t => t.passed).length;
    const failed = total - passed;
    console.log(`Total Tests Executed: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed / Defect Confirmed: ${failed}`);
    console.log('====================================================\n');
  }
}

runAudit().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
