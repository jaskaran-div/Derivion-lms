export interface Content {
  id: string;
  title: string;
  type: string;
  duration?: number;
  isFree: boolean;
  isPublished: boolean;
  cloudFrontUrl?: string;
  externalUrl?: string;
  assessmentId?: string | null;
  mimeType?: string | null;
  isCompleted?: boolean;
}

export interface Section {
  id: string;
  title: string;
  contents: Content[];
}

export interface Course {
  id: string;
  title: string;
  slug: string;
  description: string;
  shortDesc?: string;
  thumbnail?: string;
  price: number | string;
  discountPrice?: number | string | null;
  isFree: boolean;
  level: string;
  language: string;
  totalDuration: number;
  totalLessons: number;
  totalStudents: number;
  requirements: string[];
  objectives: string[];
  tags: string[];
  category: { name: string };
  sections: Section[];
  isEnrolled: boolean;
  isBookmarked?: boolean;
  updatedAt?: string;
}

export interface LessonNote {
  id: string;
  timestamp: number;
  text: string;
  createdAt: string;
  content: { id: string; title: string };
}
