import type { ReactNode } from "react";

export interface Person {
  firstName: string;
  lastName: string;
  name: string;
  role: string;
  avatar: string;
  email: string;
  location: string;
  languages: string[];
}

export interface Newsletter {
  display: boolean;
  title: ReactNode;
  description: ReactNode;
}

export interface SocialItem {
  name: string;
  icon: string;
  link: string;
  essential?: boolean;
}

export type Social = SocialItem[];

export interface Home {
  path: string;
  image: string;
  label: string;
  title: string;
  description: string;
}

export interface Blog {
  path: string;
  label: string;
  title: string;
  description: string;
}

export interface GalleryImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface Gallery {
  path: string;
  label: string;
  title: string;
  description: string;
  images: GalleryImage[];
}

export interface Work {
  path: string;
  label: string;
  title: string;
  description: string;
}

export interface AboutTableOfContent {
  display: boolean;
  subItems: boolean;
}

export interface AboutAvatar {
  display: boolean;
}

export interface AboutCalendar {
  display: boolean;
  link: string;
}

export interface AboutIntro {
  display: boolean;
  title: string;
  description: ReactNode;
}

export interface AboutWorkImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface AboutWorkExperience {
  company: string;
  timeframe: string;
  role: string;
  achievements: ReactNode[];
  images: AboutWorkImage[];
}

export interface AboutWork {
  display: boolean;
  title: string;
  experiences: AboutWorkExperience[];
}

export interface AboutStudies {
  display: boolean;
  title: string;
  institutions: unknown[];
}

export interface AboutTechnical {
  display: boolean;
  title: string;
  skills: unknown[];
}

export interface About {
  path: string;
  label: string;
  title: string;
  description: string;
  tableOfContent: AboutTableOfContent;
  avatar: AboutAvatar;
  calendar: AboutCalendar;
  intro: AboutIntro;
  work: AboutWork;
  studies: AboutStudies;
  technical: AboutTechnical;
}
