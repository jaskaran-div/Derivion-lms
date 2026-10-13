const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Admin (mustChangePassword = true so prod admins must rotate it) ────────
  const hashedPassword = await bcrypt.hash('Admin@123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@derivion.com' },
    update: {
      password: hashedPassword,
      role: 'ADMIN',
      isActive: true,
      // Force password change on first login in any environment
      mustChangePassword: process.env.NODE_ENV === 'production',
    },
    create: {
      email: 'admin@derivion.com',
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'ADMIN',
      isActive: true,
      mustChangePassword: process.env.NODE_ENV === 'production',
    },
  });

  // ─── Teacher ─────────────────────────────────────────────────────────────────
  const teacherPassword = await bcrypt.hash('Teacher@123', 12);
  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@derivion.com' },
    update: {
      password: teacherPassword,
      role: 'TEACHER',
      isActive: true,
      mustChangePassword: process.env.NODE_ENV === 'production',
    },
    create: {
      email: 'teacher@derivion.com',
      username: 'teacher1',
      password: teacherPassword,
      firstName: 'Priya',
      lastName: 'Sharma',
      role: 'TEACHER',
      isActive: true,
      mustChangePassword: process.env.NODE_ENV === 'production',
    },
  });

  // ─── Student ─────────────────────────────────────────────────────────────────
  const studentPassword = await bcrypt.hash('Student@123', 12);
  const student = await prisma.user.upsert({
    where: { email: 'student@derivion.com' },
    update: {
      password: studentPassword,
      role: 'STUDENT',
      isActive: true,
      mustChangePassword: process.env.NODE_ENV === 'production',
    },
    create: {
      email: 'student@derivion.com',
      username: 'student1',
      password: studentPassword,
      firstName: 'John',
      lastName: 'Doe',
      role: 'STUDENT',
      isActive: true,
      mustChangePassword: process.env.NODE_ENV === 'production',
    },
  });

  // ─── Categories ──────────────────────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.category.upsert({ where: { slug: 'web-development' }, update: {}, create: { name: 'Web Development', slug: 'web-development', description: 'Frontend & Backend development', icon: '💻' } }),
    prisma.category.upsert({ where: { slug: 'data-science' }, update: {}, create: { name: 'Data Science', slug: 'data-science', description: 'ML, AI, and Analytics', icon: '📊' } }),
    prisma.category.upsert({ where: { slug: 'design' }, update: {}, create: { name: 'UI/UX Design', slug: 'design', description: 'Product and graphic design', icon: '🎨' } }),
    prisma.category.upsert({ where: { slug: 'business' }, update: {}, create: { name: 'Business', slug: 'business', description: 'Entrepreneurship and management', icon: '💼' } }),
    prisma.category.upsert({ where: { slug: 'marketing' }, update: {}, create: { name: 'Digital Marketing', slug: 'marketing', description: 'SEO, social media, and ads', icon: '📱' } }),
  ]);

  // ─── Sample course ───────────────────────────────────────────────────────────
  const course = await prisma.course.upsert({
    where: { slug: 'complete-web-development-bootcamp-2024' },
    update: {},
    create: {
      title: 'Complete Web Development Bootcamp 2024',
      slug: 'complete-web-development-bootcamp-2024',
      description: 'Learn HTML, CSS, JavaScript, React, Node.js, and more. A comprehensive course to become a full-stack developer.',
      shortDesc: 'Become a full-stack web developer from scratch',
      price: 1999,
      isFree: false,
      status: 'PUBLISHED',
      level: 'Beginner',
      language: 'English',
      tags: ['HTML', 'CSS', 'JavaScript', 'React', 'Node.js'],
      requirements: ['No prior coding experience needed', 'A computer with internet access'],
      objectives: [
        'Build full-stack web applications',
        'Master React and Node.js',
        'Deploy apps to production',
        'Build a professional portfolio',
      ],
      categoryId: categories[0].id,
      totalLessons: 3,
    },
  });

  // ─── Sample section + content ─────────────────────────────────────────────
  const section1 = await prisma.section.upsert({
    where: { id: 'seed-section-1' },
    update: {},
    create: {
      id: 'seed-section-1',
      title: 'Introduction to HTML & CSS',
      description: 'Foundation of web development',
      order: 0,
      courseId: course.id,
      isPublished: true,
    },
  }).catch(() =>
    prisma.section.create({
      data: {
        title: 'Introduction to HTML & CSS',
        description: 'Foundation of web development',
        order: 0,
        courseId: course.id,
        isPublished: true,
      },
    })
  );

  // ─── Sample school (for demo) ─────────────────────────────────────────────
  const school = await prisma.school.upsert({
    where: { code: 'DEMO001' },
    update: {},
    create: {
      name: 'Demo School',
      code: 'DEMO001',
      city: 'Delhi',
      state: 'Delhi',
      isActive: true,
    },
  });

  // Add teacher to demo school
  await prisma.schoolMembership.upsert({
    where: { schoolId_userId: { schoolId: school.id, userId: teacher.id } },
    update: {},
    create: { schoolId: school.id, userId: teacher.id, role: 'TEACHER' },
  });

  console.log('✅ Seeding complete!');
  console.log('');
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️  PRODUCTION MODE: All seed accounts require a password change on first login.');
    console.log('   Admin:   admin@derivion.com / Admin@123   ← CHANGE IMMEDIATELY');
    console.log('   Teacher: teacher@derivion.com / Teacher@123 ← CHANGE IMMEDIATELY');
    console.log('   Student: student@derivion.com / Student@123 ← CHANGE IMMEDIATELY');
  } else {
    console.log('Admin:   admin@derivion.com / Admin@123');
    console.log('Teacher: teacher@derivion.com / Teacher@123');
    console.log('Student: student@derivion.com / Student@123');
    console.log('');
    console.log('🏫 Demo School Code: DEMO001');
  }
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
