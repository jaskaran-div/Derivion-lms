/**
 * Who a learner belongs to. A learner is a "school learner" when a school or teacher brought them in
 * (created by a teacher/import, linked to a school or placed in a class); everyone else is an individual learner.
 */
const prisma = require('../config/database');

const schoolLearnerWhere = {
  OR: [
    { schoolId: { not: null } },
    { createdById: { not: null } },
    { schoolMemberships: { some: {} } },
    { studentBatches: { some: {} } },
  ],
};

const isSchoolLearner = async (userId) =>
  Boolean(await prisma.user.findFirst({ where: { id: userId, role: 'STUDENT', ...schoolLearnerWhere }, select: { id: true } }));

// Every student of a school: linked directly, a member, placed in one of its classes, or created by one of its teachers
const schoolStudentWhere = (schoolId) => ({
  role: 'STUDENT',
  OR: [
    { schoolId },
    { schoolMemberships: { some: { schoolId } } },
    { studentBatches: { some: { class: { schoolId } } } },
    { createdBy: { schoolMemberships: { some: { schoolId, role: 'TEACHER' } } } },
  ],
});

// Teachers of a school: members with the teacher role or assigned to one of its classes
const schoolTeacherWhere = (schoolId) => ({
  role: 'TEACHER',
  OR: [
    { schoolMemberships: { some: { schoolId } } },
    { teacherAssignments: { some: { class: { schoolId } } } },
    { classesAsTeacher: { some: { schoolId } } },
  ],
});

// The school a teacher works at (first membership, else the school of an assigned class)
const teacherSchoolId = async (teacherId) => {
  const membership = await prisma.schoolMembership.findFirst({
    where: { userId: teacherId, isActive: true },
    orderBy: { joinedAt: 'asc' },
    select: { schoolId: true },
  });
  if (membership) return membership.schoolId;
  const assignment = await prisma.teacherClassAssignment.findFirst({
    where: { teacherId },
    select: { class: { select: { schoolId: true } } },
  });
  return assignment?.class.schoolId || null;
};

// Links a newly created learner to their teacher's school so the school sees them
const linkLearnerToSchool = async (studentId, schoolId) => {
  if (!schoolId) return;
  await prisma.user.update({ where: { id: studentId }, data: { schoolId } });
  await prisma.schoolMembership.upsert({
    where: { schoolId_userId: { schoolId, userId: studentId } },
    create: { schoolId, userId: studentId, role: 'STUDENT' },
    update: {},
  });
};

module.exports = {
  schoolLearnerWhere, isSchoolLearner, schoolStudentWhere, schoolTeacherWhere, teacherSchoolId, linkLearnerToSchool,
};
