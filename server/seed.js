import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robust CSV Parser handling quotes, escaped quotes and multi-line values
function parseCSV(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let currentField = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentField.trim());
      if (row.some((cell) => cell.length > 0)) {
        lines.push(row);
      }
      row = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || row.length > 0) {
    row.push(currentField.trim());
    if (row.some((cell) => cell.length > 0)) {
      lines.push(row);
    }
  }

  return lines;
}

export function runSeed() {
  console.log('--- Starting Monipack CRM Data Seed ---');

  // 1. Seed Products if empty
  if (db.data.products.length === 0) {
    const defaultProducts = [
      // Monipack - Packaging & Disposables
      {
        sku: 'MNP-CUP-PET-16',
        name: 'Clear PET Cold Cups 16oz',
        nameAr: 'أكواب بلاستيك شفاف بارد 16 أونصة',
        category: 'Packaging Products',
        brand: 'Monipack',
        description: 'Ultra-clear durable PET cups suitable for iced coffee, smoothies, and juices.',
        unit: 'CTN',
        priceOMR: 14.5,
        stock: 450,
      },
      {
        sku: 'MNP-CUP-KFT-08',
        name: 'Double Wall Kraft Hot Cups 8oz',
        nameAr: 'أكواب كرافت دبل ساخن 8 أونصة',
        category: 'Packaging Products',
        brand: 'Monipack',
        description: 'Insulated double-wall kraft cups, no sleeve required. Heat resistant.',
        unit: 'CTN',
        priceOMR: 12.8,
        stock: 320,
      },
      {
        sku: 'MNP-BAG-TW-M',
        name: 'Kraft Takeaway Paper Bags with Twisted Handle (Medium)',
        nameAr: 'أكياس ورقية كرافت بمقبض متوسط',
        category: 'Packaging Products',
        brand: 'Monipack',
        description: 'Eco-friendly natural brown kraft shopping & takeaway bag with reinforced handle.',
        unit: 'CTN',
        priceOMR: 8.5,
        stock: 600,
      },
      {
        sku: 'MNP-FOIL-450',
        name: 'Heavy Duty Cling Film 45cm x 300m',
        nameAr: 'رول نايلون تغليف أطعمة 45 سم',
        category: 'Packaging Products',
        brand: 'Monipack',
        description: 'Commercial grade food service plastic film with cutter box.',
        unit: 'ROLL',
        priceOMR: 3.75,
        stock: 250,
      },
      {
        sku: 'MNP-ALU-1COMP',
        name: 'Aluminium Food Container 1-Compartment with Lid',
        nameAr: 'صحون قصدير مقسم واحد مع غطاء',
        category: 'Disposable Products',
        brand: 'Monipack',
        description: 'Heavy gauge heat retaining aluminium meal container.',
        unit: 'CTN',
        priceOMR: 11.2,
        stock: 400,
      },
      {
        sku: 'MNP-CUT-ECO4',
        name: 'Eco Meal Cutlery Set 4-in-1 (Fork, Spoon, Knife, Napkin)',
        nameAr: 'طقم ملاعق وشوك وسكاكين مع منديل',
        category: 'Disposable Products',
        brand: 'Monipack',
        description: 'Individually wrapped hygienic disposable cutlery pack.',
        unit: 'CTN',
        priceOMR: 9.9,
        stock: 500,
      },
      {
        sku: 'MNP-BOX-BGR',
        name: 'Burger Box Kraft Paperboard 12x12x7cm',
        nameAr: 'علب برجر كرافت مقوى',
        category: 'Packaging Products',
        brand: 'Monipack',
        description: 'Grease-resistant lock-lid kraft burger boxes.',
        unit: 'CTN',
        priceOMR: 13.4,
        stock: 380,
      },
      {
        sku: 'MNP-BWL-750',
        name: 'Microwaveable Meal Prep Bowls with Clear Lid 750ml',
        nameAr: 'طاسات بلاستيك للميكروويف 750 مل',
        category: 'Disposable Products',
        brand: 'Monipack',
        description: 'Leak-resistant food container suitable for hot and cold dishes.',
        unit: 'CTN',
        priceOMR: 15.6,
        stock: 280,
      },

      // Moniclean - Cleaning & Hygiene
      {
        sku: 'MNC-DIS-05L',
        name: 'Moniclean Antibacterial Surface Disinfectant 5L',
        nameAr: 'موني كلين معقم ومطهر أسطح 5 لتر',
        category: 'Cleaning Products',
        brand: 'Moniclean',
        description: 'Hospital grade multi-surface disinfectant liquid.',
        unit: 'CAN',
        priceOMR: 4.8,
        stock: 190,
      },
      {
        sku: 'MNC-FLR-05L',
        name: 'Moniclean Industrial Floor Cleaner 5L (Pine & Floral)',
        nameAr: 'موني كلين منظف ومطهر أرضيات مركز 5 لتر',
        category: 'Cleaning Products',
        brand: 'Moniclean',
        description: 'High active sanitizing floor detergent for hotels and restaurants.',
        unit: 'CAN',
        priceOMR: 3.9,
        stock: 210,
      },
      {
        sku: 'MNC-HND-05L',
        name: 'Moniclean Luxury Foaming Hand Wash 5L (Oud & Rose)',
        nameAr: 'موني كلين غسول رغوي لليدين برائحة الورد والعود',
        category: 'Cleaning Products',
        brand: 'Moniclean',
        description: 'Moisturizing formula for commercial restrooms and food prep areas.',
        unit: 'CAN',
        priceOMR: 4.2,
        stock: 160,
      },
      {
        sku: 'MNC-ROL-CF06',
        name: 'Moniclean Blue Centrefeed Paper Towel Rolls (Pack of 6)',
        nameAr: 'موني كلين رول ورق أزرق للمطابخ والمطاعم',
        category: 'Cleaning Products',
        brand: 'Moniclean',
        description: '2-ply high absorption embossed kitchen paper wipe rolls.',
        unit: 'PACK',
        priceOMR: 6.5,
        stock: 310,
      },

      // Monifood - Flavored Syrups & Ingredients
      {
        sku: 'MNF-SYR-MOJ',
        name: 'FO Mojito Flavored Syrup 700ml',
        nameAr: 'شراب موهيتو بنكهة الليمون والنعناع اف او 700 مل',
        category: 'Food Products',
        brand: 'Monifood',
        description: 'Authentic mint and lime blend for mocktails and specialty drinks.',
        unit: 'PCS',
        priceOMR: 2.65,
        stock: 140,
      },
      {
        sku: 'MNF-SYR-BLU',
        name: 'FO Blue Curacao Flavored Syrup 700ml',
        nameAr: 'شراب بلو كوراساو اف او 700 مل',
        category: 'Food Products',
        brand: 'Monifood',
        description: 'Vibrant blue citrus beverage syrup for signature mocktails.',
        unit: 'PCS',
        priceOMR: 2.65,
        stock: 120,
      },
      {
        sku: 'MNF-SYR-PAS',
        name: 'FO Passion Fruit Puree & Syrup 1L',
        nameAr: 'بيوريه وشراب باشن فروت اف او 1 لتر',
        category: 'Food Products',
        brand: 'Monifood',
        description: 'Tropical real fruit syrup concentrate for cafes and bubble teas.',
        unit: 'PCS',
        priceOMR: 3.4,
        stock: 95,
      },

      // Kohe - Professional Kitchen & Cutlery
      {
        sku: 'KOH-KNF-CHF8',
        name: 'Kohe Professional Chef Knife 8-Inch High Carbon Stainless',
        nameAr: 'سكين الشيف الاحترافي كوهي 8 بوصة',
        category: 'Kohe Products',
        brand: 'Kohe',
        description: 'Precision forged razor-sharp blade with ergonomic anti-slip grip.',
        unit: 'PCS',
        priceOMR: 8.2,
        stock: 85,
      },
      {
        sku: 'KOH-KNF-PAR3',
        name: 'Kohe Kitchen Paring Knife 3.5-Inch',
        nameAr: 'سكين تقشير كوهي 3.5 بوصة',
        category: 'Kohe Products',
        brand: 'Kohe',
        description: 'Agile peeling and prep knife with safety colored handle.',
        unit: 'PCS',
        priceOMR: 2.1,
        stock: 220,
      },
      {
        sku: 'KOH-SHR-HVY',
        name: 'Kohe Heavy Duty Commercial Kitchen Shears',
        nameAr: 'مقص مطبخ احترافي ستانلس ستيل كوهي',
        category: 'Kohe Products',
        brand: 'Kohe',
        description: 'Multi-purpose shears with bottle opener and bone notcher.',
        unit: 'PCS',
        priceOMR: 3.5,
        stock: 110,
      },
    ];

    defaultProducts.forEach((p) => db.createProduct(p));
    console.log(`Seeded ${defaultProducts.length} default products across 4 divisions.`);
  }

  // Note: CSV Demo Leads and Sample Quotations auto-seeding disabled for production.
  // Leads will now be imported cleanly via Customer Care / Leads CSV importer.

  console.log(`Database ready: ${db.data.leads.length} leads, ${db.data.products.length} products, ${db.data.quotations.length} quotations.`);
}

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  runSeed();
}
