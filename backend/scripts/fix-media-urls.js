// Rewrites course thumbnails, course preview videos and user avatars that were saved as direct S3 URLs
// (which the private bucket answers with 403) to the /api/media/<key> form served by the API.
// Dry run by default; pass --apply to write.
//
//   node scripts/fix-media-urls.js           # show what would change
//   node scripts/fix-media-urls.js --apply   # update the rows
require('dotenv').config();
const prisma = require('../src/config/database');
const { isPublicMediaKey, getPublicMediaUrl } = require('../src/config/aws');

const apply = process.argv.includes('--apply');
const S3_URL = /^https:\/\/[^/]+\.s3[.-]([a-z0-9-]+\.)?amazonaws\.com\/(.+)$/;

const newUrl = (value) => {
  const m = typeof value === 'string' && value.match(S3_URL);
  if (!m) return null;
  const key = decodeURIComponent(m[2].split('?')[0]);
  if (!isPublicMediaKey(key)) return null;
  const url = getPublicMediaUrl(key);
  return url !== value ? url : null;
};

(async () => {
  let changes = 0;
  const courses = await prisma.course.findMany({ select: { id: true, title: true, thumbnail: true, previewVideo: true } });
  for (const c of courses) {
    const data = {};
    const t = newUrl(c.thumbnail); if (t) data.thumbnail = t;
    const v = newUrl(c.previewVideo); if (v) data.previewVideo = v;
    if (!Object.keys(data).length) continue;
    changes += 1;
    console.log(`course "${c.title}": ${Object.keys(data).join(', ')}`);
    if (apply) await prisma.course.update({ where: { id: c.id }, data });
  }
  const users = await prisma.user.findMany({ where: { avatar: { contains: 'amazonaws.com' } }, select: { id: true, email: true, avatar: true } });
  for (const u of users) {
    const a = newUrl(u.avatar);
    if (!a) continue;
    changes += 1;
    console.log(`user ${u.email}: avatar`);
    if (apply) await prisma.user.update({ where: { id: u.id }, data: { avatar: a } });
  }
  console.log(`${changes} row(s) ${apply ? 'updated' : 'would change (dry run; pass --apply to write)'}`);
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
