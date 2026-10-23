/** Picture checklist (questions 3 and 4) and document fact ticks. */

const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'and', 'or',
  'in', 'on', 'at', 'for', 'with', 'that', 'this', 'it', 'its', 'you', 'your', 'there', 'some',
  'his', 'her', 'their', 'they', 'he', 'she', 'them', 'him', 'who', 'which', 'also', 'very',
  'can', 'see', 'seen', 'visible', 'appear', 'appears', 'seems', 'seem', 'look', 'looks', 'like',
  'picture', 'photo', 'image', 'scene', 'i', 'we', 'my', 'so', 'as', 'by', 'up', 'out', 'just',
  'has', 'have', 'having', 'do', 'does', 'one', 'into', 'from', 'about', 'what', 'these', 'those',
  'other', 'another', 'over', 'under', 'while', 'then', 'such', 'than', 'too', 'both', 'each',
  'stand', 'stands', 'standing', 'sit', 'sits', 'sitting', 'wear', 'wears', 'wearing', 'dressed',
  'hold', 'holds', 'holding', 'not', 'no', 'also', 'kind', 'sort', 'bit', 'little', 'small', 'large', 'big'
]);

// Words a speaker may use for the same thing. Every word in a row maps to the first word.
const SYNONYMS = [
  ['shop', 'store', 'shops', 'stores', 'boutique', 'market', 'outlet'],
  ['florist', 'flowershop', 'florists'],
  ['flower', 'bouquet', 'bunch', 'blossom', 'rose', 'tulip', 'floral', 'arrangement', 'plant', 'greenery', 'green plant', 'potted', 'leaf', 'leafy', 'fern'],
  ['person', 'people', 'adult', 'man', 'men', 'woman', 'women', 'guy', 'lady', 'ladies', 'gentleman', 'individual', 'folk', 'someone', 'somebody', 'girl', 'boy', 'kid', 'child', 'children', 'teen', 'teenager', 'youth', 'customer', 'shopper', 'client', 'guest', 'traveler', 'traveller', 'passenger', 'worker', 'employee', 'staff', 'clerk', 'assistant', 'attendant', 'cashier', 'vendor', 'seller', 'salesperson', 'saleswoman', 'salesman', 'agent', 'server', 'waiter', 'waitress', 'stylist', 'hairdresser', 'pharmacist', 'technician', 'cobbler', 'lifeguard', 'swimmer', 'speaker', 'presenter', 'listener', 'coworker', 'colleague', 'pedestrian', 'driver', 'parent', 'mother', 'father', 'mom', 'dad'],
  ['teen', 'teenager', 'teenage', 'young', 'youth', 'kid', 'boy', 'girl', 'student', 'adolescent', 'younger'],
  ['old', 'older', 'elderly', 'senior', 'aged', 'grey haired', 'gray haired', 'middle aged'],
  ['clerk', 'worker', 'employee', 'staff', 'assistant', 'attendant', 'shopkeeper', 'owner', 'florist', 'cashier', 'vendor', 'seller', 'salesperson', 'saleswoman', 'salesman', 'agent', 'server', 'waiter', 'waitress', 'stylist', 'hairdresser', 'barber', 'pharmacist', 'technician', 'repairman', 'cobbler', 'clerk', 'staffer', 'member', 'teller'],
  ['customer', 'shopper', 'client', 'buyer', 'guest', 'patron', 'visitor', 'traveler', 'traveller', 'passenger'],
  ['wrap', 'wrapping', 'wrapped', 'wraps', 'package', 'pack', 'packing', 'bag', 'prepare', 'preparing', 'arrange', 'arranging', 'tie', 'tying', 'fold'],
  ['carry', 'carrying', 'carries', 'bring', 'bringing', 'move', 'moving', 'take', 'taking', 'transport', 'haul', 'lift', 'lifting', 'push', 'pull'],
  ['wallet', 'purse', 'money', 'cash', 'card', 'pay', 'paying', 'payment'],
  ['bucket', 'pail', 'container', 'vase', 'pot', 'tub', 'bin'],
  ['counter', 'desk', 'table', 'checkout', 'register', 'workbench', 'bench', 'stand', 'stall'],
  ['door', 'doorway', 'entrance', 'exit', 'entry', 'gate'],
  ['window', 'glass', 'windows'],
  ['street', 'sidewalk', 'road', 'pavement', 'outside', 'outdoors', 'lane'],
  ['apron', 'aprons', 'smock'],
  ['shirt', 'blouse', 'top', 'tee', 'tshirt', 'polo', 'shirts'],
  ['hoodie', 'sweatshirt', 'hooded', 'sweater', 'jumper', 'pullover', 'cardigan', 'fleece'],
  ['coat', 'jacket', 'blazer', 'parka', 'overcoat', 'raincoat', 'vest'],
  ['navy', 'blue', 'dark blue', 'navy blue'],
  ['gray', 'grey', 'silver'],
  ['beige', 'tan', 'cream', 'khaki', 'light brown', 'brown', 'off white'],
  ['purple', 'violet', 'lilac', 'lavender'],
  ['pink', 'rose colored'],
  ['red', 'crimson', 'maroon'],
  ['teal', 'turquoise', 'green'],
  ['look', 'looking', 'browse', 'browsing', 'check', 'checking', 'examine', 'examining', 'view', 'viewing', 'watch', 'watching', 'observe', 'observing', 'choose', 'choosing', 'pick', 'picking', 'select', 'selecting', 'shop', 'shopping', 'search', 'searching', 'stare', 'staring', 'glance', 'admire', 'admiring', 'inspect', 'inspecting'],
  ['wait', 'waiting', 'queue', 'queuing', 'line', 'lining'],
  ['give', 'giving', 'hand', 'handing', 'pass', 'passing', 'offer', 'offering', 'deliver', 'show', 'showing'],
  ['talk', 'talking', 'chat', 'chatting', 'speak', 'speaking', 'converse', 'conversation', 'discuss', 'discussing', 'explain', 'explaining', 'tell', 'telling', 'ask', 'asking', 'help', 'helping', 'serve', 'serving', 'assist', 'assisting'],
  ['write', 'writing', 'note', 'notes', 'jot', 'jotting', 'fill', 'filling', 'sign', 'signing', 'take notes'],
  ['phone', 'cellphone', 'smartphone', 'mobile', 'cell'],
  ['suitcase', 'luggage', 'bag', 'baggage', 'case', 'roller', 'trolley'],
  ['passport', 'ticket', 'document', 'id', 'papers', 'boarding pass'],
  ['airport', 'terminal', 'check in', 'departure', 'airline'],
  ['monitor', 'computer', 'screen', 'pc', 'laptop', 'display'],
  ['airplane', 'plane', 'aircraft', 'jet'],
  ['cup', 'mug', 'coffee', 'drink', 'beverage', 'glass'],
  ['shelf', 'shelves', 'shelving', 'rack', 'racks', 'display', 'cabinet'],
  ['tool', 'tools', 'wrench', 'wrenches', 'plier', 'pliers', 'hammer', 'screwdriver', 'equipment'],
  ['box', 'boxes', 'package', 'parcel', 'carton', 'cardboard'],
  ['cafe', 'café', 'coffee shop', 'coffeeshop', 'restaurant', 'bistro', 'diner'],
  ['notebook', 'notepad', 'journal', 'diary', 'pad', 'book'],
  ['pastry', 'pastries', 'croissant', 'croissants', 'bread', 'bun', 'cake', 'dessert', 'snack', 'food'],
  ['tray', 'plate', 'platter', 'dish'],
  ['sun', 'sunny', 'sunlight', 'sunshine', 'bright', 'shadow', 'shadows', 'daylight'],
  ['crosswalk', 'crossing', 'intersection', 'zebra crossing', 'cross', 'crossing'],
  ['stroller', 'pram', 'buggy', 'baby carriage', 'pushchair'],
  ['car', 'cars', 'vehicle', 'vehicles', 'traffic', 'taxi', 'van'],
  ['vest', 'safety vest', 'hi vis', 'high visibility'],
  ['cart', 'dolly', 'trolley', 'hand truck', 'handcart'],
  ['building', 'buildings', 'brick', 'storefront', 'shopfront'],
  ['pottery', 'ceramic', 'ceramics', 'clay', 'potter', 'studio', 'workshop', 'class'],
  ['bowl', 'bowls', 'pot', 'pots', 'vase', 'cup', 'mug', 'jar'],
  ['wheel', 'potter wheel', 'spinning'],
  ['paint', 'painting', 'paints', 'decorate', 'decorating', 'color', 'coloring', 'colour', 'colouring', 'brush'],
  ['wash', 'washing', 'clean', 'cleaning', 'rinse', 'rinsing', 'sink', 'tap', 'faucet'],
  ['supermarket', 'grocery', 'groceries', 'grocery store', 'market', 'checkout', 'till'],
  ['scan', 'scanning', 'scanner', 'ring up', 'barcode'],
  ['basket', 'baskets', 'shopping basket'],
  ['milk', 'carton', 'dairy'],
  ['tote', 'cloth bag', 'shopping bag', 'reusable bag', 'bag', 'canvas bag'],
  ['belt', 'conveyor', 'conveyor belt'],
  ['stripe', 'stripes', 'striped', 'stripy'],
  ['denim', 'jean', 'jeans'],
  ['furniture', 'showroom', 'sofa', 'couch', 'settee', 'loveseat'],
  ['sample', 'swatch', 'fabric', 'material', 'cloth', 'textile'],
  ['dress', 'gown', 'skirt'],
  ['lamp', 'lamps', 'light', 'lights', 'lighting'],
  ['chair', 'chairs', 'seat', 'seats', 'armchair', 'stool'],
  ['tent', 'tents', 'canopy', 'canopies', 'awning', 'umbrella', 'stall', 'stalls'],
  ['farmer', 'farmers', 'market', 'outdoor market', 'produce'],
  ['vegetable', 'vegetables', 'tomato', 'tomatoes', 'greens', 'lettuce', 'produce', 'fruit', 'fruits', 'crate', 'crates', 'veggies'],
  ['plaid', 'checked', 'checkered', 'flannel', 'tartan'],
  ['office', 'workplace', 'workspace', 'desk', 'desks', 'cubicle'],
  ['headset', 'headphone', 'headphones', 'earphones', 'microphone'],
  ['point', 'pointing', 'gesture', 'gesturing', 'indicate', 'indicating', 'show', 'showing'],
  ['type', 'typing', 'work', 'working', 'use', 'using', 'busy', 'keyboard'],
  ['bottle', 'bottles', 'water bottle'],
  ['playground', 'park', 'play area', 'play', 'playing'],
  ['climb', 'climbing', 'climbs', 'clamber', 'ladder', 'frame', 'climbing frame', 'jungle gym'],
  ['swing', 'swings', 'swinging'],
  ['fence', 'grass', 'tree', 'trees', 'lawn'],
  ['laundromat', 'laundry', 'launderette', 'laundrette', 'washing machine', 'washer', 'washers', 'machine', 'machines', 'dryer'],
  ['towel', 'towels', 'clothes', 'clothing', 'laundry', 'garments', 'sheets'],
  ['load', 'loading', 'put', 'putting', 'place', 'placing', 'stuff', 'insert'],
  ['read', 'reading', 'book', 'magazine', 'novel'],
  ['detergent', 'soap', 'bottle'],
  ['post office', 'postal', 'mail', 'post', 'courier', 'shipping'],
  ['weigh', 'weighing', 'scale', 'scales', 'weight'],
  ['form', 'paperwork', 'document', 'paper'],
  ['pen', 'pencil', 'marker'],
  ['pool', 'swimming', 'swim', 'swimmer', 'swimmers', 'lane', 'lanes', 'water'],
  ['cap', 'hat', 'swim cap', 'helmet'],
  ['goggle', 'goggles', 'glasses'],
  ['kickboard', 'board', 'float', 'foam board'],
  ['pharmacy', 'drugstore', 'chemist', 'medicine', 'medication', 'prescription', 'drug'],
  ['lab coat', 'white coat', 'coat'],
  ['repair', 'repairing', 'fix', 'fixing', 'mend', 'mending', 'stitch', 'stitching', 'sew', 'sewing', 'work on', 'working on'],
  ['shoe', 'shoes', 'boot', 'boots', 'footwear', 'sneaker', 'sneakers'],
  ['thread', 'threads', 'spool', 'spools', 'yarn', 'string', 'needle'],
  ['charger', 'chargers', 'cable', 'cables', 'adapter', 'plug'],
  ['sort', 'sorting', 'organize', 'organizing', 'arrange', 'arranging', 'go through', 'going through'],
  ['print', 'printing', 'printer', 'printers', 'copy', 'copier', 'photocopier', 'copy shop', 'print shop'],
  ['stack', 'pile', 'bundle', 'ream', 'heap'],
  ['salon', 'hairdresser', 'barbershop', 'barber', 'beauty salon', 'hair salon'],
  ['cut', 'cutting', 'trim', 'trimming', 'haircut', 'style', 'styling', 'scissors', 'comb', 'combing'],
  ['cape', 'gown', 'cover', 'smock'],
  ['mirror', 'mirrors', 'reflection', 'reflect', 'reflected'],
  ['meeting', 'presentation', 'conference', 'meeting room', 'boardroom', 'seminar', 'lecture'],
  ['chart', 'graph', 'bar chart', 'bar graph', 'diagram', 'slide', 'data'],
  ['curtain', 'curtains', 'drape', 'drapes', 'blind', 'blinds'],
  ['left', 'lefthand', 'left side'],
  ['right', 'righthand', 'right side'],
  ['front', 'foreground', 'near', 'nearest', 'closest', 'close'],
  ['back', 'background', 'behind', 'rear', 'far', 'distance', 'farther', 'further'],
  ['middle', 'center', 'centre', 'between', 'central'],
  ['beside', 'next', 'near', 'nearby', 'by', 'side', 'alongside'],
  ['inside', 'indoor', 'indoors', 'interior', 'within'],
  ['carry', 'holding', 'with'],
  ['bright', 'light', 'sunny', 'sunlit', 'daylight']
];

const NUMBERS = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', couple: '2', pair: '2', several: 'n', few: 'n' };

const CANON = new Map();
for (const row of SYNONYMS) {
  const head = stem(row[0]);
  for (const word of row) {
    const key = word.includes(' ') ? word : stem(word);
    if (!CANON.has(key)) CANON.set(key, new Set());
    CANON.get(key).add(head);
  }
}

export function normalizePhrase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’']s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plural, -ing, -ed and -ly folded away so "wraps", "wrapping" and "wrapped" match "wrap". */
export function stem(word) {
  let w = String(word || '').toLowerCase();
  if (NUMBERS[w]) return NUMBERS[w];
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ing') && w.length > 5) {
    w = w.slice(0, -3);
    if (/([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss)$/.test(w)) w = w.slice(0, -1);
    return w;
  }
  if (w.endsWith('ed') && w.length > 4) {
    w = w.slice(0, -2);
    if (/([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss)$/.test(w)) w = w.slice(0, -1);
    return w;
  }
  if (w.endsWith('es') && /(ch|sh|ss|x|z)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  return w;
}

function concepts(text) {
  const words = normalizePhrase(text).split(' ').filter(Boolean);
  const out = new Set();
  for (let i = 0; i < words.length; i += 1) {
    const two = i + 1 < words.length ? `${words[i]} ${words[i + 1]}` : '';
    if (two && CANON.has(two)) for (const c of CANON.get(two)) out.add(c);
    const s = stem(words[i]);
    out.add(s);
    if (CANON.has(s)) for (const c of CANON.get(s)) out.add(c);
  }
  return out;
}

/** Content words of a phrase, each a set of acceptable concepts. */
function needs(phrase) {
  const words = normalizePhrase(phrase).split(' ').filter((w) => w && !STOP.has(w));
  return words.map((word) => {
    const s = stem(word);
    const set = new Set([s]);
    if (CANON.has(s)) for (const c of CANON.get(s)) set.add(c);
    return set;
  });
}

function covered(have, need) {
  for (const c of need) if (have.has(c)) return true;
  return false;
}

/** Exact padded match, kept for document facts. */
export function phraseHit(transcript, phrase) {
  const needle = normalizePhrase(phrase);
  if (!needle) return false;
  return ` ${normalizePhrase(transcript)} `.includes(` ${needle} `);
}

/** Lenient match: every content word of a short phrase (or most of a long one) is said, in any order, with synonyms. */
export function looseHit(have, phrase, share) {
  const list = needs(phrase);
  if (!list.length) return false;
  const got = list.filter((need) => covered(have, need)).length;
  if (list.length <= 3) return got === list.length;
  return got / list.length >= (share || 0.6);
}

const PERSON = new Set([...(CANON.get('person') || [])]);
const PERSON_WORDS = SYNONYMS[3].map((w) => stem(w));

function peopleMentioned(transcript) {
  const words = normalizePhrase(transcript).split(' ').map(stem);
  return words.filter((w) => PERSON_WORDS.includes(w) && !['people', 'person'].includes(w)).length;
}

function looseFact(transcript, fact) {
  if (phraseHit(transcript, fact)) return true;
  const fold = (value) => normalizePhrase(value)
    .replace(/\b(\d+)\s+00\b/g, '$1')
    .replace(/\bp\s+m\b/g, 'pm')
    .replace(/\ba\s+m\b/g, 'am');
  const hay = fold(transcript);
  const words = fold(fact).split(' ').filter((word) => word.length > 2 && !STOP.has(word));
  if (!words.length) return false;
  const got = words.filter((word) => hay.includes(word)).length;
  return got / words.length >= 0.55;
}

/** Share of the weighted checklist that earns each score on the 0-3 scale. */
export const BANDS = { three: 0.5, two: 0.3 };

function itemHit(item, have, transcript) {
  const phrases = [...((item && item.accept) || []), ...((item && item.keys) || [])].filter(Boolean);
  if (phrases.some((phrase) => looseHit(have, phrase))) return true;
  if (item && item.category !== 'place' && item.text && looseHit(have, item.text, 0.75)) return true;
  if (item && item.category === 'people') {
    const m = normalizePhrase(item.text).match(/\b(one|two|three|four|five|six|seven|\d)\b/);
    const n = m ? Number(NUMBERS[m[1]] || m[1]) : 0;
    if (n && peopleMentioned(transcript) >= Math.max(2, n - 1)) return true;
  }
  return false;
}

/**
 * Score 0-3 from weighted checklist hits (as on the real test), plus 0-5 stars kept for old records.
 * A matched contradiction caps the score. Omissions are not contradictions.
 */
export function scoreChecklist(question, transcript) {
  const items = Array.isArray(question && question.key_elements) ? question.key_elements : [];
  const text = String(transcript || '');
  const have = concepts(text);
  let earned = 0;
  let possible = 0;
  let cap = 3;
  const rows = items.map((item) => {
    const weight = Number(item && item.weight) || 0;
    if (weight > 0) possible += weight;
    const hit = itemHit(item, have, text);
    if (hit && weight > 0) earned += weight;
    let contradicted = false;
    for (const entry of (item && item.contradict) || []) {
      if (!entry) continue;
      const core = String(entry.text || '').replace(/^(this is|it is|there is|there are|the scene is|the picture shows)\s+(an?\s+|the\s+)?/i, '');
      if (!phraseHit(text, entry.text) && !(item.category === 'place' && core && phraseHit(text, core))) continue;
      contradicted = true;
      const nextCap = Number(entry.cap);
      if (Number.isFinite(nextCap)) cap = Math.min(cap, Math.max(1, Math.round(nextCap * 0.6)));
    }
    return {
      id: item && item.id,
      role: item && item.role,
      category: item && item.category,
      text: String((item && (item.statement || item.text)) || ''),
      hit,
      contradicted
    };
  });
  // Relevance gate: a description of the wrong scene cannot score above 1.
  const place = items.find((item) => item && item.category === 'place');
  if (place && !rows.find((row) => row.id === place.id).hit) cap = Math.min(cap, rows.filter((row) => row.hit).length < 4 ? 1 : 2);
  const share = possible > 0 ? earned / possible : 0;
  const words = normalizePhrase(text).split(' ').filter(Boolean).length;
  let score = 0;
  if (share >= BANDS.three) score = 3;
  else if (share >= BANDS.two) score = 2;
  else if (share > 0 || words >= 8) score = 1;
  if (score > cap) score = cap;
  return {
    score3: score,
    max: 3,
    stars: Math.round((score / 3) * 5),
    share,
    cap,
    earned,
    possible,
    capped: cap < 3,
    rows
  };
}

export function factHits(question, transcript) {
  const facts = Array.isArray(question && question.answer_facts) ? question.answer_facts : [];
  return facts.map((fact) => ({
    text: String(fact || ''),
    hit: looseFact(transcript, fact)
  })).filter((row) => row.text);
}
