// theme.js
// Design tokens for The Forum. Same family as the sibling apps -- warm
// paper base, one confident accent, serif headings over a sans UI -- but
// its own palette so the three apps are recognizably siblings without
// looking like the same app twice. Household Ledger is teal, The Workshop
// is rust; The Forum is a deep civic blue on paper.

export const SANS = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const SERIF = "'Fraunces', 'Iowan Old Style', Georgia, serif";

export const PAGE = '#F6F3EC';
export const CARD = '#FFFFFF';
export const CARD_SOFT = '#EFEBE1';
export const INK = '#242A30';
export const INK_SOFT = '#59636D';
export const MUTE = '#8A939C';
export const LINE = '#E3DED3';

export const FORUM = '#2E5E7E';
export const FORUM_SOFT = '#DEE9F0';
export const FORUM_DEEP = '#22485F';
export const CLAY = '#C07744';
export const CLAY_SOFT = '#F5E5D6';
export const SAGE = '#5C8368';
export const SAGE_SOFT = '#DFEAE2';
export const PLUM = '#7A5385';
export const PLUM_SOFT = '#ECE2EF';
export const AMBER = '#C2963C';
export const AMBER_SOFT = '#F4E9CC';

export const RADIUS = 14;
export const RADIUS_SM = 9;
export const TRANSITION = '140ms ease';

// Every action the activity log records, in one place: the log writer, the
// Activity Log filters, the CSV export, and the badge colors all read from
// this instead of each keeping their own copy of the string list. Adding an
// action means adding it here and to actionValues() in firestore.rules.
export const ACTIONS = {
  'category.create': { label: 'Created category', verb: 'created the category', color: PLUM, soft: PLUM_SOFT },
  'category.rename': { label: 'Renamed category', verb: 'renamed a category', color: AMBER, soft: AMBER_SOFT },
  'category.archive': { label: 'Archived category', verb: 'archived the category', color: MUTE, soft: CARD_SOFT },
  'category.unarchive': { label: 'Unarchived category', verb: 'unarchived the category', color: SAGE, soft: SAGE_SOFT },
  'thread.create': { label: 'Started thread', verb: 'started the thread', color: FORUM, soft: FORUM_SOFT },
  'post.create': { label: 'Added post', verb: 'posted in', color: CLAY, soft: CLAY_SOFT },
  'comment.create': { label: 'Commented', verb: 'commented on a post in', color: SAGE, soft: SAGE_SOFT },
  'reply.create': { label: 'Replied', verb: 'replied to a comment in', color: PLUM, soft: PLUM_SOFT },
};

export const ACTION_ORDER = Object.keys(ACTIONS);

// Stable per-person colors for the engagement chart and author initials.
// Assigned by sorted position in the cast of people who have actually
// posted, so a given person keeps the same color across sessions and
// across both of your screens.
export const PERSON_COLORS = [FORUM, CLAY, SAGE, PLUM, AMBER, '#A8556B', '#4C6B8A', '#7E7A3F'];

export function personColor(personId, roster) {
  const index = roster.indexOf(personId);
  return PERSON_COLORS[(index < 0 ? 0 : index) % PERSON_COLORS.length];
}

// Body text limits, mirrored by isBody()/isText() in firestore.rules so a
// too-long entry is caught in the form instead of by a rejected write.
export const MAX_BODY = 20000;
export const MAX_TITLE = 140;
export const MAX_CATEGORY_NAME = 60;
