import type { Site, Metadata, Socials } from "@types";

export const SITE: Site = {
  NAME: "jforce.github.io",
  EMAIL: "jforce@redhat.com",
  NUM_POSTS_ON_HOMEPAGE: 1,
};

export const HOME: Metadata = {
  TITLE: "Home",
  DESCRIPTION: "Welcome to my personal website.",
};

export const BLOG: Metadata = {
  TITLE: "Blog",
  DESCRIPTION: "A collection of articles on topics I am passionate about.",
};

export const ABOUT: Metadata = {
  TITLE: "About",
  DESCRIPTION: "What I have done.",
};

export const SOCIALS: Socials = [
  {
    NAME: "github",
    HREF: "https://github.com/jforce"
  },
  {
    NAME: "linkedin",
    HREF: "https://www.linkedin.com/in/jamesforce",
  }
];
