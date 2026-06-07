const commonsImage = (fileName, width = 1600) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=${width}`;

const commonsPage = (fileName) =>
  `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName).replaceAll("%20", "_")}`;

const proxiedImageUrl = (remoteUrl) => `/demo/storefront/image?source=${encodeURIComponent(remoteUrl)}`;

const proxiedCommonsImage = (fileName, width = 1600) =>
  proxiedImageUrl(commonsImage(fileName, width));

const remoteImage = ({ remoteUrl, sourceUrl, alt, license, sourceName }) => ({
  url: proxiedImageUrl(remoteUrl),
  remoteUrl,
  alt,
  sourceName,
  sourceUrl,
  license,
});

const image = (fileName, alt, license, sourceName = "Wikimedia Commons", width = 1600) => ({
  url: proxiedCommonsImage(fileName, width),
  remoteUrl: commonsImage(fileName, width),
  alt,
  sourceName,
  sourceUrl: commonsPage(fileName),
  license,
});

const commonsDirectImage = (remoteUrl, fileName, alt, license, sourceName = "Wikimedia Commons") =>
  remoteImage({
    remoteUrl,
    sourceUrl: commonsPage(fileName),
    alt,
    sourceName,
    license,
  });

const metImage = (remoteUrl, objectId, alt) =>
  remoteImage({
    remoteUrl,
    sourceUrl: `https://www.metmuseum.org/art/collection/search/${objectId}`,
    alt,
    sourceName: "The Met Open Access",
    license: "CC0 public domain dedication",
  });

export const categories = ["All", "Electronics", "Fashion", "Accessories", "Home & Living"];

export const products = [
  {
    id: "arcbook-14",
    sku: "ATL-EL-1401",
    title: "ArcBook 14",
    brand: "Northstar Systems",
    category: "Electronics",
    price: 899,
    compareAt: 1099,
    rating: 4.7,
    reviews: 214,
    inventory: 32,
    badge: "Fast seller",
    description:
      "A compact laptop for creators, students, and everyday business workflows with a bright display and lightweight chassis.",
    features: ["14 inch display", "All-day battery", "Aluminum body"],
    images: [
      image("Laptop image.jpg", "Open laptop on a desk", "CC0 public domain dedication"),
      image(
        "Zenith laptop at Osborne computer at Powell's Technical Bookstore.jpg",
        "Vintage laptop displayed in a technical bookstore",
        "CC0 public domain dedication",
      ),
      image("Acer aspire 2355xc laptop computer in store.jpg", "Laptop computer in a retail display", "Public domain"),
      image(
        "Laptop computer monitor (Unsplash).jpg",
        "Laptop screen and keyboard in product-lighting composition",
        "CC0 public domain dedication",
      ),
      commonsDirectImage(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Laptop_Programmcode.jpg/1920px-Laptop_Programmcode.jpg",
        "Laptop Programmcode.jpg",
        "Laptop showing programming code",
        "CC0 public domain dedication",
      ),
      commonsDirectImage(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Backlit_Laptop_Keyboard.jpg/1920px-Backlit_Laptop_Keyboard.jpg",
        "Backlit Laptop Keyboard.jpg",
        "Backlit laptop keyboard detail",
        "CC0 public domain dedication",
      ),
    ],
  },
  {
    id: "pulse-headphones",
    sku: "ATL-EL-2204",
    title: "Pulse Studio Headphones",
    brand: "Signal & Co.",
    category: "Electronics",
    price: 129,
    compareAt: 169,
    rating: 4.5,
    reviews: 89,
    inventory: 58,
    badge: "Audio pick",
    description:
      "Closed-back stereo headphones positioned for work calls, music production demos, and focused listening.",
    features: ["Closed-back cups", "Soft headband", "Studio monitoring profile"],
    images: [
      image("Action-Max-Stereo-Headphones.jpg", "Black stereo headphones", "Public domain"),
      image("Kaitlin Headphones.JPG", "Headphones product detail", "Public domain"),
      image("AKG Stereo headphones K-66.JPG", "AKG stereo headphones", "Public domain"),
      commonsDirectImage(
        "https://upload.wikimedia.org/wikipedia/commons/5/5e/JVC_headphones_HA-L50.JPG",
        "JVC headphones HA-L50.JPG",
        "JVC headphones product photo",
        "Public domain",
      ),
      image("Sony MDR-V6 Headphones boxed.jpg", "Boxed Sony headphones", "Public domain"),
      image(
        "Desk-music-headphones-earphones (24243083451).jpg",
        "Headphones and earphones on a desk",
        "CC0 public domain dedication",
      ),
    ],
  },
  {
    id: "creel-cotton-dress",
    sku: "ATL-FA-1830",
    title: "Creel Cotton Dress",
    brand: "Atelier Archive",
    category: "Fashion",
    price: 188,
    compareAt: 240,
    rating: 4.8,
    reviews: 131,
    inventory: 17,
    badge: "Editorial",
    description:
      "A catalog-friendly dress listing built around a museum-quality open-access fashion object and refined styling metadata.",
    features: ["Cotton fabric", "Archive silhouette", "Soft neutral palette"],
    images: [
      commonsDirectImage(
        "https://images.metmuseum.org/CRDImages/ci/original/DT6847.jpg",
        "Dress MET DT6847.jpg",
        "Cotton dress on a form",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
      commonsDirectImage(
        "https://images.metmuseum.org/CRDImages/ci/original/DP321108.jpg",
        "Dress MET DP321108.jpg",
        "Museum dress front view",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
      commonsDirectImage(
        "https://images.metmuseum.org/CRDImages/ci/original/DT5639.jpg",
        "Dress MET DT5639.jpg",
        "Archive dress studio view",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
      commonsDirectImage(
        "https://images.metmuseum.org/CRDImages/ci/original/DT5640.jpg",
        "Dress MET DT5640.jpg",
        "Archive dress alternate view",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
      commonsDirectImage(
        "https://images.metmuseum.org/CRDImages/ci/original/DP321110.jpg",
        "Dress MET DP321110.jpg",
        "Dress detail with structured silhouette",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
      commonsDirectImage(
        "https://images.metmuseum.org/CRDImages/ci/original/DP321109.jpg",
        "Dress MET DP321109.jpg",
        "Dress side view on a form",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
    ],
  },
  {
    id: "freestock-runner",
    sku: "ATL-FA-2401",
    title: "Freestock Runner",
    brand: "Stride Goods",
    category: "Fashion",
    price: 74,
    compareAt: 96,
    rating: 4.4,
    reviews: 77,
    inventory: 41,
    badge: "Weekend",
    description:
      "Casual shoe listing for everyday outfit merchandising, cross-sell demos, and short launch reels.",
    features: ["Flexible sole", "Streetwear styling", "Easy-care upper"],
    images: [
      image("Women's shoes (26636051905).jpg", "Women's shoes arranged for product photography", "CC0 public domain dedication"),
      image("Gfp-shoes.jpg", "Pile of shoes", "Public domain dedication"),
      metImage("https://images.metmuseum.org/CRDImages/ci/original/DT2630.jpg", "79101", "Archive shoes in studio lighting"),
      commonsDirectImage(
        "https://images.metmuseum.org/CRDImages/ci/original/54.61.90a-b_CP2.jpg",
        "Shoes MET 54.61.90a-b CP2.jpg",
        "Silk shoes side profile",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
      commonsDirectImage(
        "https://images.metmuseum.org/CRDImages/ci/original/DP156283.jpg",
        "Shoes MET DP156283.jpg",
        "Leather shoes product view",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
      commonsDirectImage(
        "https://images.metmuseum.org/CRDImages/ci/original/DP108286.jpg",
        "Shoes MET DP108286.jpg",
        "American shoes studio view",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
    ],
  },
  {
    id: "trail-daypack",
    sku: "ATL-AC-9012",
    title: "Trail Daypack",
    brand: "Ridge Supply",
    category: "Accessories",
    price: 64,
    compareAt: 82,
    rating: 4.6,
    reviews: 166,
    inventory: 73,
    badge: "Carry more",
    description:
      "A durable daypack for outdoor, campus, and daily commute use with simple feature metadata for A2A render prompts.",
    features: ["Large main pocket", "Outdoor-ready fabric", "Utility straps"],
    images: [
      image("Backpack.jpg", "Outdoor backpack", "Public domain"),
      commonsDirectImage(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/0000Achild_backpack.jpg/1920px-0000Achild_backpack.jpg",
        "0000Achild backpack.jpg",
        "Large backpack at a public market",
        "Public domain",
      ),
      commonsDirectImage(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Operation_Backpack_110409-A-NP396-099.jpg/1920px-Operation_Backpack_110409-A-NP396-099.jpg",
        "Operation Backpack 110409-A-NP396-099.jpg",
        "Backpack supplies in a row",
        "Public domain",
      ),
      commonsDirectImage(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Backpackers.JPG/1920px-Backpackers.JPG",
        "Backpackers.JPG",
        "Travel backpacks in outdoor setting",
        "Public domain",
      ),
      metImage("https://images.metmuseum.org/CRDImages/ci/original/30.135.176dig.jpg", "81550", "Archive drawstring bag"),
      metImage("https://images.metmuseum.org/CRDImages/is/original/K-2.JPG", "787736", "Saddle bag textile detail"),
    ],
  },
  {
    id: "heritage-watch",
    sku: "ATL-AC-5520",
    title: "Heritage Wristwatch",
    brand: "Tempo House",
    category: "Accessories",
    price: 119,
    compareAt: 149,
    rating: 4.3,
    reviews: 52,
    inventory: 25,
    badge: "Giftable",
    description:
      "A straightforward watch listing for gift guides, accessory bundles, and premium product-shot video demos.",
    features: ["Analog face", "Metal case", "Classic strap"],
    images: [
      image("Wrist_watchs.jpg", "Wristwatch product photo", "CC0 public domain dedication"),
      image("Wristwatch.jpg", "Wristwatch close-up", "Public domain"),
      metImage("https://images.metmuseum.org/CRDImages/rl/original/rl1975.1.1244.R.jpg", "459201", "Gold watch case studio view"),
      metImage("https://images.metmuseum.org/CRDImages/es/original/DP-28360-001.jpg", "194007", "Ornate watch face detail"),
      metImage("https://images.metmuseum.org/CRDImages/es/original/DP-29565-002.jpg", "194198", "Round watch product view"),
      metImage("https://images.metmuseum.org/CRDImages/es/original/DP338179.jpg", "209247", "Classic watch in case"),
    ],
  },
  {
    id: "tiffany-table-lamp",
    sku: "ATL-HL-2011",
    title: "Tiffany Table Lamp",
    brand: "Home Archive",
    category: "Home & Living",
    price: 245,
    compareAt: 310,
    rating: 4.9,
    reviews: 96,
    inventory: 11,
    badge: "Statement",
    description:
      "A decorative table lamp listing for home merchandising demos with rich material, mood, and room-placement metadata.",
    features: ["Stained glass shade", "Warm accent light", "Heritage design"],
    images: [
      commonsDirectImage(
        "https://images.metmuseum.org/CRDImages/ad/original/DP259087.jpg",
        "Table lamp MET DP259087.jpg",
        "Tiffany table lamp",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
      commonsDirectImage(
        "https://images.metmuseum.org/CRDImages/ad/original/DP254463.jpg",
        "Table lamp MET DP254463.jpg",
        "Tiffany table lamp detail",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
      commonsDirectImage(
        "https://images.metmuseum.org/CRDImages/ad/original/DP254460.jpg",
        "Table lamp MET DP254460.jpg",
        "Tiffany table lamp alternate detail",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
      commonsDirectImage(
        "https://images.metmuseum.org/CRDImages/ad/original/DP259088.jpg",
        "Table lamp MET DP259088.jpg",
        "Tiffany table lamp alternate view",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
      commonsDirectImage(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Table_Lamp_MET_ADA3488.jpg/1920px-Table_Lamp_MET_ADA3488.jpg",
        "Table Lamp MET ADA3488.jpg",
        "Decorative ceramic table lamp",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
      commonsDirectImage(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Table_Lamp_MET_DT4342.jpg/1920px-Table_Lamp_MET_DT4342.jpg",
        "Table Lamp MET DT4342.jpg",
        "Fulper table lamp",
        "CC0 public domain dedication",
        "Wikimedia Commons / The Met",
      ),
    ],
  },
  {
    id: "beaded-handbag",
    sku: "ATL-AC-3307",
    title: "Beaded Keepsake Handbag",
    brand: "Archive & Loom",
    category: "Accessories",
    price: 86,
    compareAt: 112,
    rating: 4.2,
    reviews: 38,
    inventory: 19,
    badge: "Limited",
    description:
      "A compact handbag listing for accessory merchandising, social reels, and close-up texture-led product storytelling.",
    features: ["Beaded surface", "Drawstring profile", "Event-ready scale"],
    images: [
      metImage("https://images.metmuseum.org/CRDImages/ad/original/DP-15303-024.jpg", "717543", "Beaded bag product view"),
      metImage("https://images.metmuseum.org/CRDImages/ci/original/26.56.80.jpg", "98406", "Archive handbag front view"),
      metImage("https://images.metmuseum.org/CRDImages/ci/original/26.56.79.jpg", "98405", "Patterned handbag studio view"),
      metImage("https://images.metmuseum.org/CRDImages/ci/original/26.56.82.jpg", "98408", "Structured handbag with clasp"),
      metImage("https://images.metmuseum.org/CRDImages/ci/original/48.187.653.jpg", "102698", "Drawstring handbag detail"),
      image("White and blue handbag (Unsplash).jpg", "White and blue handbag", "CC0 public domain dedication"),
    ],
  },
];
