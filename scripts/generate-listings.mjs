// Builds the practice listings the backend serves, and a placeholder image for
// each one:
//
//   backend/data/listings.seed.json  →  backend/data/listings.json   (seed + generated)
//                                    →  public/images/<id>.svg       (one per listing)
//
// The hand-written seed listings are kept exactly as they are; the rest are
// generated from the catalogue below with a fixed random seed, so running this
// again produces the same output. All of it is fictional practice data – no real
// sellers, no real listings.
//
//   npm run generate:listings

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seed = JSON.parse(readFileSync(join(root, "backend/data/listings.seed.json"), "utf8"));

/* ---------- deterministic randomness ---------- */

let state = 20260925;
function rand() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ---------- catalogue ---------- */

// kind decides sizes and materials: top / outer / bottom / shoe / one (accessories)
const SIZES = {
  top: ["XS", "S", "M", "L", "XL", "XXL"],
  outer: ["S", "M", "L", "XL"],
  bottom: ["S", "M", "L", "XL"],
  shoe: ["US 7", "US 8", "US 9", "US 10", "US 11", "US 12"],
  one: ["One Size"],
};

const MATERIALS = {
  top: ["cotton", "heavyweight cotton", "organic cotton", "cotton jersey"],
  fleece: ["heavyweight fleece", "brushed fleece", "loopback cotton"],
  outer: ["nylon", "waxed cotton", "ripstop nylon", "wool blend"],
  denim: ["rigid denim", "selvedge denim", "stonewashed denim"],
  bottom: ["cotton twill", "brushed fleece", "nylon"],
  shoe: ["leather", "suede", "mesh and suede", "canvas"],
  one: ["cotton", "wool", "nylon", "leather"],
  knit: ["wool", "merino wool", "lambswool", "cotton knit"],
};

const CONDITIONS = [
  ["New with tags", 1.2],
  ["Like new", 1.1],
  ["Excellent condition", 1.05],
  ["Good condition", 1.0],
  ["Good condition, some fading", 0.9],
  ["Well worn, still solid", 0.8],
];

const COLOURS = {
  neutral: ["Black", "White", "Grey", "Navy", "Cream", "Olive", "Brown", "Beige"],
  bright: ["Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Pink"],
  denim: ["Indigo", "Light Wash", "Mid Wash", "Dark Wash", "Black"],
};

const MARKETPLACES = ["Grailed", "Grailed", "Grailed", "Depop", "Depop", "eBay", "eBay", "Poshmark", "Mercari", "Vinted"];

// type: the noun in the title. material: which MATERIALS list. colours: which palette.
// base: typical resale price in USD. detail: one phrase for the description.
const T = (model, type, kind, base, detail, extra = {}) => ({ model, type, kind, base, detail, ...extra });

const CATALOGUE = [
  // ----- streetwear -----
  { name: "Chrome Hearts", prefix: "ch", tags: "Streetwear, luxury", items: [
    T("Cemetery Cross", "Sweatpants", "bottom", 380, "cross print down the leg", { material: "fleece" }),
    T("Horseshoe", "Tee", "top", 210, "horseshoe logo across the chest"),
    T("Dagger", "Trucker Hat", "one", 200, "dagger embroidery on the front panel"),
    T("Cross Patch", "Crewneck Sweatshirt", "top", 420, "leather cross patch, crewneck sweatshirt", { material: "fleece" }),
  ]},
  { name: "Supreme", prefix: "sup", tags: "Streetwear", items: [
    T("Box Logo", "Hoodie", "top", 480, "box logo hooded sweatshirt", { material: "fleece" }),
    T("Small Box", "Tee", "top", 60, "small box logo t-shirt"),
    T("Motion Logo", "Hoodie", "top", 220, "motion logo hooded sweatshirt", { material: "fleece" }),
    T("Camp", "Cap", "one", 55, "5-panel camp cap"),
    T("Script Logo", "Beanie", "one", 45, "script logo beanie hat"),
  ]},
  { name: "Palace", prefix: "pal", tags: "Streetwear, skate", items: [
    T("Tri-Ferg", "Hoodie", "top", 160, "tri-ferg logo hooded sweatshirt", { material: "fleece" }),
    T("Basically A", "Tee", "top", 45, "basically a logo t-shirt"),
    T("P-Line", "Shell Jacket", "outer", 190, "lightweight shell jacket"),
  ]},
  { name: "Stussy", prefix: "stu", tags: "Streetwear, surf", items: [
    T("Stock Logo", "Hoodie", "top", 120, "stock logo hooded sweatshirt", { material: "fleece" }),
    T("8 Ball", "Tee", "top", 40, "8 ball graphic t-shirt"),
    T("Basic", "Bucket Hat", "one", 50, "cotton bucket hat"),
    T("Work", "Jacket", "outer", 150, "canvas work jacket"),
  ]},
  { name: "A Bathing Ape", prefix: "bape", tags: "Streetwear, Japanese", items: [
    T("Shark", "Full Zip Hoodie", "top", 320, "shark face full-zip hooded sweatshirt", { material: "fleece", colours: "bright" }),
    T("College Logo", "Tee", "top", 90, "college logo t-shirt"),
    T("Camo", "Cap", "one", 80, "camo snapback cap"),
  ]},
  { name: "Kith", prefix: "kith", tags: "Streetwear", items: [
    T("Williams III", "Hoodie", "top", 140, "williams III hooded sweatshirt", { material: "fleece" }),
    T("Box Logo", "Tee", "top", 55, "box logo t-shirt"),
    T("Sweatpants", "Sweatpants", "bottom", 110, "tapered fleece sweatpants", { material: "fleece" }),
  ]},
  { name: "Aime Leon Dore", prefix: "ald", tags: "Streetwear, menswear", items: [
    T("Uniform", "Hoodie", "top", 160, "uniform logo hooded sweatshirt", { material: "fleece" }),
    T("Tonal Logo", "Tee", "top", 70, "tonal logo t-shirt"),
    T("Cable Knit", "Sweater", "top", 210, "cable knit jumper", { material: "knit" }),
    T("Wool", "Overcoat", "outer", 480, "double breasted wool overcoat"),
  ]},
  { name: "Noah", prefix: "noah", tags: "Streetwear, menswear", items: [
    T("Core Logo", "Hoodie", "top", 130, "core logo hooded sweatshirt", { material: "fleece" }),
    T("Winged Foot", "Tee", "top", 50, "winged foot logo t-shirt"),
    T("Rugby", "Shirt", "top", 120, "striped rugby shirt"),
  ]},
  { name: "Brain Dead", prefix: "bd", tags: "Streetwear, graphic", items: [
    T("Logo Head", "Hoodie", "top", 120, "logo head graphic hooded sweatshirt", { material: "fleece" }),
    T("Psychedelic", "Tee", "top", 45, "psychedelic graphic t-shirt", { colours: "bright" }),
    T("Climber", "Pants", "bottom", 130, "climber pants with cinch waist"),
  ]},
  { name: "Cav Empt", prefix: "ce", tags: "Streetwear, Japanese, techwear", items: [
    T("Overdye", "Hoodie", "top", 220, "overdyed graphic hooded sweatshirt", { material: "fleece" }),
    T("Noise", "Tee", "top", 90, "noise graphic t-shirt"),
  ]},
  { name: "Human Made", prefix: "hm", tags: "Streetwear, Japanese", items: [
    T("Heart", "Tee", "top", 95, "polar bear graphic t-shirt"),
    T("Tsuriami", "Hoodie", "top", 260, "loopwheel hooded sweatshirt", { material: "fleece" }),
    T("Duck", "Cap", "one", 85, "duck logo 6-panel cap"),
  ]},
  { name: "Fear of God Essentials", prefix: "ess", tags: "Streetwear, minimal", items: [
    T("Essentials", "Hoodie", "top", 95, "rubberised logo hooded sweatshirt", { material: "fleece" }),
    T("Essentials", "Sweatpants", "bottom", 85, "relaxed fleece sweatpants", { material: "fleece" }),
    T("Essentials", "Tee", "top", 45, "boxy logo t-shirt"),
    T("Essentials", "Shorts", "bottom", 60, "fleece shorts", { material: "fleece" }),
  ]},
  { name: "Champion", prefix: "champ", tags: "Sportswear, vintage", items: [
    T("Reverse Weave", "Hoodie", "top", 55, "reverse weave hooded sweatshirt", { material: "fleece" }),
    T("Reverse Weave", "Crewneck Sweatshirt", "top", 45, "reverse weave crewneck sweatshirt", { material: "fleece" }),
    T("Heritage", "Tee", "top", 22, "heritage logo t-shirt"),
  ]},
  { name: "Starter", prefix: "starter", tags: "Sportswear, vintage, 90s", items: [
    T("Satin", "Bomber Jacket", "outer", 110, "satin bomber jacket, retro 90s"),
    T("Snapback", "Cap", "one", 35, "retro snapback cap"),
  ]},
  { name: "Nike", prefix: "nike", tags: "Sportswear", items: [
    T("Dunk Low", "Sneakers", "shoe", 130, "dunk low sneakers, classic two-tone colour blocking shoes", { colours: "bright" }),
    T("Air Force 1", "Sneakers", "shoe", 90, "air force 1 low shoes", { colours: "neutral" }),
    T("Tech Fleece", "Hoodie", "top", 85, "tech fleece full-zip hooded sweatshirt", { material: "fleece" }),
    T("Tech Fleece", "Joggers", "bottom", 80, "tech fleece jogger sweatpants", { material: "fleece" }),
    T("Vintage Swoosh", "Tee", "top", 35, "vintage swoosh t-shirt"),
    T("ACG", "Windbreaker", "outer", 120, "ACG windbreaker jacket, outdoor"),
  ]},
  { name: "Jordan", prefix: "jordan", tags: "Sportswear, sneakers", items: [
    T("Air Jordan 1 High", "Sneakers", "shoe", 220, "air jordan 1 high sneakers shoes", { colours: "bright" }),
    T("Air Jordan 4", "Sneakers", "shoe", 260, "air jordan 4 sneakers shoes"),
    T("Flight", "Hoodie", "top", 75, "flight logo hooded sweatshirt", { material: "fleece" }),
  ]},
  { name: "Adidas", prefix: "adi", tags: "Sportswear", items: [
    T("Samba OG", "Sneakers", "shoe", 110, "samba OG sneakers, gum sole shoes"),
    T("Gazelle", "Sneakers", "shoe", 95, "gazelle suede sneakers shoes", { colours: "bright" }),
    T("Firebird", "Track Jacket", "outer", 70, "three stripes track jacket, retro"),
    T("Trefoil", "Hoodie", "top", 60, "trefoil logo hooded sweatshirt", { material: "fleece" }),
  ]},
  { name: "New Balance", prefix: "nb", tags: "Sportswear, sneakers", items: [
    T("990v3", "Sneakers", "shoe", 180, "990v3 made in USA running shoes"),
    T("550", "Sneakers", "shoe", 100, "550 basketball sneakers shoes"),
    T("2002R", "Sneakers", "shoe", 120, "2002R running shoes"),
  ]},
  { name: "Asics", prefix: "asics", tags: "Sportswear, sneakers", items: [
    T("Gel-Kayano 14", "Sneakers", "shoe", 150, "gel-kayano 14 running shoes"),
    T("Gel-1130", "Sneakers", "shoe", 95, "gel-1130 running shoes"),
  ]},
  { name: "Salomon", prefix: "salo", tags: "Outdoor, gorpcore, sneakers", items: [
    T("XT-6", "Sneakers", "shoe", 170, "XT-6 trail running shoes, gorpcore"),
    T("Speedcross", "Sneakers", "shoe", 110, "speedcross trail running shoes"),
  ]},
  { name: "Converse", prefix: "conv", tags: "Sneakers, casual", items: [
    T("Chuck 70 High", "Sneakers", "shoe", 65, "chuck 70 high top canvas shoes", { colours: "bright" }),
    T("One Star", "Sneakers", "shoe", 60, "one star suede shoes"),
  ]},
  { name: "Vans", prefix: "vans", tags: "Sneakers, skate", items: [
    T("Old Skool", "Sneakers", "shoe", 50, "old skool skate shoes"),
    T("Sk8-Hi", "Sneakers", "shoe", 55, "sk8-hi high top skate shoes"),
  ]},
  { name: "Dr. Martens", prefix: "dm", tags: "Footwear, boots", items: [
    T("1460", "Boots", "shoe", 110, "1460 8-eye leather boots"),
    T("1461", "Shoes", "shoe", 95, "1461 3-eye leather shoes"),
  ]},
  { name: "Timberland", prefix: "timb", tags: "Footwear, boots, workwear", items: [
    T("6-Inch Premium", "Boots", "shoe", 130, "6-inch premium waterproof boots"),
  ]},
  { name: "Birkenstock", prefix: "birk", tags: "Footwear, sandals", items: [
    T("Boston", "Clogs", "shoe", 120, "boston suede clogs"),
    T("Arizona", "Sandals", "shoe", 80, "arizona two-strap sandals"),
  ]},
  // ----- workwear / denim -----
  { name: "Carhartt WIP", prefix: "car", tags: "Workwear, streetwear", items: [
    T("Detroit", "Jacket", "outer", 160, "detroit canvas work jacket, blanket lined"),
    T("Chase", "Hoodie", "top", 85, "chase logo hooded sweatshirt", { material: "fleece" }),
    T("Double Knee", "Pants", "bottom", 95, "double knee canvas work pants"),
    T("Pocket", "Tee", "top", 30, "pocket t-shirt"),
    T("Michigan", "Coat", "outer", 190, "michigan chore coat"),
  ]},
  { name: "Dickies", prefix: "dick", tags: "Workwear", items: [
    T("874", "Work Pants", "bottom", 40, "874 original fit work pants, trousers"),
    T("Eisenhower", "Jacket", "outer", 60, "eisenhower work jacket"),
    T("Skate", "Shorts", "bottom", 35, "relaxed fit work shorts"),
  ]},
  { name: "Levi's", prefix: "levi", tags: "Denim, vintage", items: [
    T("501 Original", "Jeans", "bottom", 70, "501 original fit denim jeans", { material: "denim", colours: "denim" }),
    T("505 Regular", "Jeans", "bottom", 55, "505 regular fit denim jeans", { material: "denim", colours: "denim" }),
    T("Type III", "Trucker Jacket", "outer", 90, "type III denim trucker jacket", { material: "denim", colours: "denim" }),
    T("Vintage Silver Tab", "Jeans", "bottom", 110, "vintage 90s silver tab baggy denim jeans", { material: "denim", colours: "denim" }),
  ]},
  { name: "Wrangler", prefix: "wrang", tags: "Denim, western, vintage", items: [
    T("Cowboy Cut", "Jeans", "bottom", 45, "cowboy cut denim jeans", { material: "denim", colours: "denim" }),
    T("Western", "Shirt", "top", 50, "pearl snap western shirt"),
  ]},
  { name: "Evisu", prefix: "evisu", tags: "Denim, Japanese, Y2K", items: [
    T("Seagull", "Jeans", "bottom", 220, "painted seagull selvedge denim jeans", { material: "denim", colours: "denim" }),
    T("Daicock", "Jeans", "bottom", 260, "daicock painted denim jeans", { material: "denim", colours: "denim" }),
  ]},
  { name: "Kapital", prefix: "kap", tags: "Japanese, denim, boro", items: [
    T("Century Denim", "Jeans", "bottom", 480, "century denim sashiko jeans", { material: "denim", colours: "denim" }),
    T("Bone", "Sweater", "top", 390, "bone print knit jumper", { material: "knit" }),
    T("Ring", "Coat", "outer", 620, "ring wool coat"),
  ]},
  { name: "Needles", prefix: "needles", tags: "Japanese, streetwear", items: [
    T("Track", "Pants", "bottom", 190, "butterfly track pants, straight leg", { colours: "bright" }),
    T("Track", "Jacket", "outer", 220, "butterfly track jacket", { colours: "bright" }),
  ]},
  // ----- outdoor / gorpcore -----
  { name: "The North Face", prefix: "tnf", tags: "Outdoor, gorpcore", items: [
    T("Nuptse 1996", "Puffer Jacket", "outer", 220, "1996 retro nuptse down puffer jacket", { colours: "bright" }),
    T("Denali", "Fleece Jacket", "outer", 90, "denali polartec fleece jacket", { material: "fleece" }),
    T("Mountain Light", "Jacket", "outer", 180, "mountain light gore-tex shell jacket"),
    T("Half Dome", "Hoodie", "top", 45, "half dome logo hooded sweatshirt", { material: "fleece" }),
  ]},
  { name: "Patagonia", prefix: "pat", tags: "Outdoor, gorpcore", items: [
    T("Retro-X", "Fleece Jacket", "outer", 140, "retro-x deep pile fleece jacket", { material: "fleece" }),
    T("Synchilla Snap-T", "Fleece Pullover", "top", 80, "synchilla snap-t fleece pullover", { material: "fleece", colours: "bright" }),
    T("Baggies", "Shorts", "bottom", 40, "baggies 5-inch nylon shorts", { colours: "bright" }),
    T("Torrentshell", "Rain Jacket", "outer", 95, "torrentshell waterproof rain jacket"),
    T("P-6 Logo", "Tee", "top", 30, "P-6 logo responsibili-tee t-shirt"),
  ]},
  { name: "Arc'teryx", prefix: "arc", tags: "Outdoor, gorpcore, technical", items: [
    T("Beta LT", "Shell Jacket", "outer", 380, "beta LT gore-tex shell jacket"),
    T("Atom LT", "Insulated Jacket", "outer", 200, "atom LT insulated jacket"),
    T("Gamma", "Pants", "bottom", 150, "gamma softshell hiking pants"),
    T("Bird Word", "Cap", "one", 40, "bird word logo cap"),
  ]},
  { name: "Salomon Apparel", prefix: "salap", tags: "Outdoor, gorpcore", items: [
    T("Bonatti", "Rain Jacket", "outer", 110, "bonatti waterproof trail jacket"),
  ]},
  { name: "Moncler", prefix: "monc", tags: "Luxury, outerwear", items: [
    T("Maya", "Puffer Jacket", "outer", 900, "maya down puffer jacket, lacquered nylon"),
    T("Logo", "Hoodie", "top", 380, "logo patch hooded sweatshirt", { material: "fleece" }),
    T("Wool", "Beanie", "one", 160, "logo wool beanie hat", { material: "knit" }),
  ]},
  { name: "Canada Goose", prefix: "cg", tags: "Luxury, outerwear", items: [
    T("Chilliwack", "Bomber Jacket", "outer", 650, "chilliwack down bomber jacket"),
    T("Expedition", "Parka", "outer", 850, "expedition down parka"),
  ]},
  { name: "Stone Island", prefix: "si", tags: "Streetwear, technical, Italian", items: [
    T("Compass Patch", "Hoodie", "top", 240, "compass badge hooded sweatshirt", { material: "fleece" }),
    T("Garment Dyed", "Crewneck Sweatshirt", "top", 200, "garment dyed crewneck sweatshirt", { material: "fleece" }),
    T("Membrana", "Jacket", "outer", 420, "membrana 3L TC shell jacket"),
    T("Compass", "Cargo Pants", "bottom", 210, "garment dyed cargo pants"),
    T("Nylon Metal", "Overshirt", "outer", 330, "nylon metal overshirt"),
  ]},
  // ----- designer -----
  { name: "Acne Studios", prefix: "acne", tags: "Designer, Scandinavian", items: [
    T("Face Patch", "Hoodie", "top", 180, "face patch hooded sweatshirt", { material: "fleece" }),
    T("Face", "Tee", "top", 80, "face patch t-shirt"),
    T("Canada", "Scarf", "one", 140, "canada wool fringe scarf", { material: "knit", colours: "bright" }),
    T("1996", "Jeans", "bottom", 150, "1996 straight fit denim jeans", { material: "denim", colours: "denim" }),
  ]},
  { name: "Comme des Garcons", prefix: "cdg", tags: "Designer, Japanese", items: [
    T("Play Double Heart", "Hoodie", "top", 220, "play double heart hooded sweatshirt", { material: "fleece" }),
    T("Play Striped", "Long Sleeve Tee", "top", 120, "play striped long sleeve t-shirt"),
    T("Play Converse", "Sneakers", "shoe", 110, "play chuck 70 collaboration shoes"),
  ]},
  { name: "Rick Owens", prefix: "ro", tags: "Designer, avant-garde", items: [
    T("DRKSHDW", "Hoodie", "top", 380, "DRKSHDW oversized hooded sweatshirt", { material: "fleece" }),
    T("Ramones", "Sneakers", "shoe", 450, "DRKSHDW ramones high top shoes"),
    T("Level", "Tee", "top", 190, "level longline t-shirt"),
    T("Drawstring", "Cargo Pants", "bottom", 520, "drawstring cargo pants"),
  ]},
  { name: "Maison Margiela", prefix: "mm", tags: "Designer, avant-garde", items: [
    T("Replica", "Sneakers", "shoe", 260, "replica german army trainer shoes"),
    T("Tabi", "Boots", "shoe", 480, "tabi split toe leather boots"),
    T("Four Stitch", "Sweater", "top", 380, "four stitch knit jumper", { material: "knit" }),
  ]},
  { name: "Off-White", prefix: "ow", tags: "Designer, streetwear", items: [
    T("Diagonal Arrows", "Hoodie", "top", 320, "diagonal arrows hooded sweatshirt", { material: "fleece" }),
    T("Caravaggio", "Tee", "top", 180, "caravaggio print t-shirt"),
    T("Industrial", "Belt", "one", 120, "industrial logo belt", { colours: "bright" }),
  ]},
  { name: "Vetements", prefix: "vet", tags: "Designer, streetwear", items: [
    T("Oversized Logo", "Hoodie", "top", 480, "oversized logo hooded sweatshirt", { material: "fleece" }),
    T("Reworked", "Jeans", "bottom", 420, "reworked destroyed denim jeans", { material: "denim", colours: "denim" }),
  ]},
  { name: "Balenciaga", prefix: "bal", tags: "Designer, luxury", items: [
    T("Triple S", "Sneakers", "shoe", 480, "triple S chunky sneakers shoes"),
    T("Campaign Logo", "Hoodie", "top", 520, "campaign logo oversized hooded sweatshirt", { material: "fleece" }),
    T("Political Campaign", "Cap", "one", 220, "political campaign logo cap"),
  ]},
  { name: "Gucci", prefix: "gucci", tags: "Designer, luxury", items: [
    T("GG Monogram", "Belt", "one", 320, "GG marmont leather belt", { material: "one" }),
    T("Ace", "Sneakers", "shoe", 380, "ace leather sneakers with web stripe shoes"),
    T("Logo", "Tee", "top", 290, "vintage logo t-shirt"),
  ]},
  { name: "Prada", prefix: "prada", tags: "Designer, luxury", items: [
    T("Re-Nylon", "Backpack", "one", 950, "re-nylon backpack bag", { material: "one" }),
    T("Linea Rossa", "Jacket", "outer", 780, "linea rossa nylon jacket"),
    T("Triangle Logo", "Cap", "one", 340, "re-nylon triangle logo cap"),
  ]},
  { name: "Ami Paris", prefix: "ami", tags: "Designer, French", items: [
    T("Ami de Coeur", "Hoodie", "top", 230, "ami de coeur logo hooded sweatshirt", { material: "fleece" }),
    T("Ami de Coeur", "Sweater", "top", 260, "ami de coeur crewneck knit jumper", { material: "knit" }),
    T("Ami de Coeur", "Tee", "top", 110, "ami de coeur logo t-shirt"),
  ]},
  { name: "Undercover", prefix: "uc", tags: "Designer, Japanese, punk", items: [
    T("Graphic", "Hoodie", "top", 320, "printed graphic hooded sweatshirt", { material: "fleece" }),
    T("Archive", "Tee", "top", 150, "archive print t-shirt"),
  ]},
  { name: "Number (N)ine", prefix: "nine", tags: "Designer, Japanese, archive", items: [
    T("Archive", "Cardigan", "top", 550, "archive mohair cardigan knit", { material: "knit" }),
    T("Archive", "Flannel Shirt", "top", 380, "archive plaid flannel shirt"),
  ]},
  { name: "Visvim", prefix: "visvim", tags: "Japanese, Americana", items: [
    T("FBT", "Sneakers", "shoe", 620, "FBT moccasin sneakers shoes"),
    T("Social Sculpture", "Jeans", "bottom", 580, "social sculpture damaged denim jeans", { material: "denim", colours: "denim" }),
  ]},
  // ----- classic / preppy / basics -----
  { name: "Ralph Lauren", prefix: "rl", tags: "Preppy, classic", items: [
    T("Polo Bear", "Sweater", "top", 190, "polo bear knit jumper", { material: "knit" }),
    T("Cable Knit", "Sweater", "top", 90, "cable knit cotton jumper", { material: "knit" }),
    T("Classic Fit", "Oxford Shirt", "top", 45, "classic fit oxford button-down shirt"),
    T("Polo Sport", "Windbreaker", "outer", 110, "vintage 90s polo sport windbreaker jacket"),
    T("Pony Logo", "Cap", "one", 35, "pony logo chino cap"),
  ]},
  { name: "Tommy Hilfiger", prefix: "tommy", tags: "Preppy, vintage, 90s", items: [
    T("Flag Logo", "Sailing Jacket", "outer", 95, "vintage 90s flag logo sailing jacket"),
    T("Big Logo", "Crewneck Sweatshirt", "top", 50, "vintage big flag crewneck sweatshirt", { material: "fleece" }),
    T("Flag", "Hoodie", "top", 55, "flag logo hooded sweatshirt", { material: "fleece" }),
  ]},
  { name: "Nautica", prefix: "naut", tags: "Preppy, vintage, 90s", items: [
    T("Reversible", "Jacket", "outer", 85, "vintage 90s reversible sailing jacket"),
    T("Competition", "Fleece Pullover", "top", 60, "competition fleece pullover", { material: "fleece" }),
  ]},
  { name: "Harley-Davidson", prefix: "hd", tags: "Vintage, biker", items: [
    T("Eagle", "Tee", "top", 60, "vintage eagle graphic t-shirt"),
    T("Leather", "Biker Jacket", "outer", 260, "vintage leather biker jacket"),
  ]},
  { name: "Uniqlo", prefix: "uni", tags: "Basics, Japanese", items: [
    T("U", "Crewneck Tee", "top", 15, "airism cotton crewneck t-shirt"),
    T("Fleece", "Full Zip Jacket", "outer", 30, "fluffy fleece full-zip jacket", { material: "fleece" }),
    T("Heattech", "Long Sleeve Tee", "top", 12, "heattech long sleeve t-shirt"),
    T("Wide Fit", "Pants", "bottom", 30, "wide fit pleated trousers"),
  ]},
  { name: "Lululemon", prefix: "lulu", tags: "Activewear", items: [
    T("Scuba", "Hoodie", "top", 75, "scuba oversized half-zip hooded sweatshirt", { material: "fleece" }),
    T("ABC", "Pants", "bottom", 70, "ABC classic fit trousers"),
    T("Define", "Jacket", "outer", 65, "define fitted jacket"),
  ]},
  { name: "Gymshark", prefix: "gym", tags: "Activewear", items: [
    T("Crest", "Hoodie", "top", 35, "crest logo hooded sweatshirt", { material: "fleece" }),
    T("Arrival", "Shorts", "bottom", 22, "arrival training shorts"),
  ]},
];

/* ---------- generation ---------- */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const generated = [];
for (const brand of CATALOGUE) {
  let n = 100;
  for (const item of brand.items) {
    const palette = COLOURS[item.colours ?? (item.kind === "shoe" ? "neutral" : "neutral")];
    const variants = between(1, 3);
    for (const colour of shuffle(palette).slice(0, variants)) {
      n++;
      const [condition, factor] = pick(CONDITIONS);
      const jitter = 0.85 + rand() * 0.3;
      const price = Math.max(10, Math.round((item.base * factor * jitter) / 5) * 5);
      const material = pick(MATERIALS[item.material ?? item.kind]);
      const size = pick(SIZES[item.kind]);
      const typeLower = item.type.toLowerCase();
      const description = `${colour} ${material} ${typeLower}: ${item.detail}. ${brand.tags}. ${condition}.`;
      generated.push({
        id: `${brand.prefix}-${n}`,
        title: `${item.model} ${item.type} ${colour}`,
        brand: brand.name,
        price,
        size,
        marketplace: pick(MARKETPLACES),
        description,
      });
    }
  }
}

const all = [...seed, ...generated];
const ids = new Set();
for (const l of all) {
  if (ids.has(l.id)) throw new Error(`Duplicate listing id ${l.id}`);
  ids.add(l.id);
}

/* ---------- placeholder images ---------- */

const PALETTE = [
  ["#1f2937", "#4b5563"],
  ["#7c2d12", "#c2410c"],
  ["#14532d", "#15803d"],
  ["#1e3a8a", "#2563eb"],
  ["#581c87", "#7e22ce"],
  ["#831843", "#be185d"],
  ["#78350f", "#b45309"],
  ["#134e4a", "#0f766e"],
];

function svgFor(l) {
  const [a, b] = PALETTE[hash(l.brand) % PALETTE.length];
  const initials = l.brand.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
  const title = l.title.length > 30 ? l.title.slice(0, 29) + "…" : l.title;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480" role="img" aria-label="${esc(l.brand)} ${esc(l.title)}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="480" height="480" fill="url(#g)"/>
  <text x="240" y="230" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="120" font-weight="700" fill="rgba(255,255,255,0.92)">${esc(initials)}</text>
  <text x="240" y="300" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="rgba(255,255,255,0.85)">${esc(l.brand)}</text>
  <text x="240" y="420" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="rgba(255,255,255,0.7)">${esc(title)}</text>
</svg>
`;
}

mkdirSync(join(root, "public/images"), { recursive: true });
for (const l of all) writeFileSync(join(root, "public/images", `${l.id}.svg`), svgFor(l));

const json = "[\n" + all.map((l) => "  " + JSON.stringify(l)).join(",\n") + "\n]\n";
writeFileSync(join(root, "backend/data/listings.json"), json);

const brands = new Set(all.map((l) => l.brand));
console.log(`Wrote backend/data/listings.json: ${all.length} listings (${seed.length} hand-written + ${generated.length} generated), ${brands.size} brands.`);
console.log(`Wrote ${all.length} placeholder images to public/images/.`);
