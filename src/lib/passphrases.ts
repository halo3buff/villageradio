/** The prompt's hidden words. Not in the CMS command list, so they never appear on the public
 *  READMEs or in admin; the hidden reference sheet (/basement) lists them from here. */

// word -> page. Phones capitalise the first letter, so the words people type there come in both cases.
export const PASSPHRASE: Record<string, string> = {
  gulam: '/station', farm: '/farm', recky: '/rec',
  Sunbird: '/station/radar', sunbird: '/station/radar',
  melee: '/melee', Melee: '/melee',
  ibibasement: '/basement', Ibibasement: '/basement',
};

// The admin entry for phones, which have no arrow keys: summons SootSprite's sprite, homepage only.
export const SPRITE_WORD = 'honeycomb';
// Opens a small TV of Melee tournament matches, on any page.
export const SSBRO_WORD = 'ssbro';
