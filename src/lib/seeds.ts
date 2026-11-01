import { GuideSchema, type Guide } from './schema';
import gmail from '../../data/guides/gmail.json';
import slack from '../../data/guides/slack.json';
import discord from '../../data/guides/discord.json';
import notion from '../../data/guides/notion.json';
import linkedin from '../../data/guides/linkedin.json';
import reddit from '../../data/guides/reddit.json';

/**
 * Hand-researched guides that ship with the repo. They are parsed at import time, so a malformed
 * file fails the build instead of showing a broken page.
 */
const raw: unknown[] = [gmail, slack, discord, notion, linkedin, reddit];

export const seedGuides: Guide[] = raw.map((value) => {
  const parsed = GuideSchema.safeParse(value);
  if (!parsed.success) {
    const slug = (value as { slug?: string }).slug ?? 'unknown';
    throw new Error(`Seed guide "${slug}" is invalid: ${parsed.error.message}`);
  }
  return parsed.data;
});
