/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CourseResult {
  title: string;
  url: string;
  platform: string;
  level: 'Iniciante' | 'Intermediário' | 'Avançado';
  category: string;
  description?: string;
  duration?: string;
}

export interface RoadmapStep {
  title: string;
  description: string;
  recommendedTopics: string[];
  estimatedTime: string;
  prerequisites?: string[];
}

export interface UserData {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string;
  role: 'user' | 'admin';
  followedTopics?: string[];
  favorites?: string[];
  lastLogin?: any;
  xp?: number;
  level?: number;
}

export interface SearchLog {
  id?: string;
  query: string;
  userId?: string;
  timestamp: any;
  resultsCount: number;
}

export interface RatingData {
  id?: string;
  courseUrl: string;
  userId: string;
  rating: number;
  timestamp: any;
}

export interface CommentData {
  id?: string;
  courseUrl: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  text: string;
  timestamp: any;
}

export interface NotificationData {
  id?: string;
  userId: string;
  title: string;
  message: string;
  topic?: string;
  isRead: boolean;
  timestamp: any;
}

export interface LearningPath {
  id: string;
  title: string;
  description: string;
  category: string;
  level: 'Iniciante' | 'Intermediário' | 'Avançado';
  courses: CourseResult[];
  icon?: string;
}
