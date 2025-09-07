
export const MCC_LABELS: Record<number, string> = {
  // Transport & travel
  4111: 'Local & Suburban Commuter Transport, Ferries',
  4112: 'Passenger Railways',
  4121: 'Taxis & Rideshare',
  4131: 'Bus Lines',
  4511: 'Airlines, Air Carriers',
  4784: 'Tolls & Highway Fees',
  4789: 'Transportation Services (Misc.)',

  // Telecom & utilities
  4812: 'Telecom Equipment & Phone Sales',
  4814: 'Telecommunication Services',
  4816: 'Computer Network / Information Services',
  4899: 'Cable, Satellite & Pay TV',
  4900: 'Utilities — Electric, Gas, Water',

  // Home & DIY
  5200: 'Home Supply Warehouse (DIY)',
  5211: 'Lumber & Building Materials',
  5231: 'Paint, Glass & Wallpaper',
  5251: 'Hardware Stores',

  // General retail
  5311: 'Department Stores',
  5331: 'Variety Stores',
  5399: 'General Merchandise (Misc.)',

  // Groceries & food
  5411: 'Grocery Stores & Supermarkets',
  5422: 'Meat Provisioners',
  5441: 'Candy, Nut & Confectionery',
  5451: 'Dairy Products Stores',
  5462: 'Bakeries',
  5499: 'Convenience & Misc. Food Stores',

  // Auto & fuel
  5511: 'Auto Dealers (New & Used)',
  5521: 'Auto Dealers (Used Only)',
  5532: 'Tire Stores',
  5533: 'Auto Parts & Accessories',
  5541: 'Service Stations',
  5542: 'Automated Fuel Dispensers',
  5571: 'Motorcycle Shops',
  5599: 'Vehicle Dealers (Misc.)',
  7523: 'Parking Lots & Garages',   // часто встречается

  // Clothing & shoes
  5611: 'Men’s Clothing & Accessories',
  5621: 'Women’s Ready-to-Wear',
  5631: 'Women’s Accessory & Specialty',
  5641: 'Children’s & Infants’ Wear',
  5651: 'Family Clothing Stores',
  5661: 'Shoe Stores',
  5691: 'Men’s & Women’s Clothing Stores',
  5699: 'Apparel & Accessories (Misc.)',

  // Home goods & electronics
  5712: 'Furniture Stores',
  5713: 'Floor Covering Stores',
  5714: 'Drapery, Window Coverings & Upholstery',
  5719: 'Home Furnishings (Misc.)',
  5722: 'Household Appliance Stores',
  5732: 'Electronics Stores',
  5734: 'Computer Software Stores',

  // Restaurants & digital goods
  5811: 'Caterers',
  5812: 'Restaurants',
  5813: 'Bars, Taverns',
  5814: 'Fast Food',
  5815: 'Digital Goods — Media',
  5816: 'Digital Goods — Apps',
  5817: 'Digital Goods — Games',
  5818: 'Digital Goods — Large Downloads',

  // Health & beauty
  5912: 'Drug Stores & Pharmacies',
  5977: 'Cosmetics & Beauty Stores',

  // Liquor & specialty retail
  5921: 'Liquor Stores (Beer, Wine, Spirits)',
  5940: 'Bicycle Shops',
  5941: 'Sporting Goods Stores',
  5942: 'Book Stores',
  5943: 'Stationery & Office Supplies',
  5944: 'Jewelry Stores',
  5945: 'Hobby, Toy & Game Shops',
  5946: 'Camera & Photographic Supply',
  5947: 'Gift, Card & Souvenir',
  5948: 'Luggage & Leather Goods',
  5949: 'Sewing / Needlework / Piece Goods',
  5964: 'Direct Marketing — Catalog',
  5968: 'Direct Marketing — Subscriptions',
  5969: 'Direct Marketing — Other',
  5970: 'Artist & Craft Supplies',
  5992: 'Florists',
  5993: 'Cigar Stores & Stands',
  5994: 'News Dealers & Newsstands',
  5995: 'Pet Shops & Pet Food',
  5999: 'Specialty Retail (Misc.)',

  // Financial & money movement
  4829: 'Money Transfers / Remittance',
  6010: 'Cash Disbursements (Manual) — Bank',
  6011: 'Cash Disbursements (ATM) — Bank',
  6012: 'Financial Institutions — Services',
  6051: 'Foreign Currency / Quasi Cash (e.g., crypto FX)',
  6211: 'Securities Brokers & Dealers', // IBKR и т.п.

  // Insurance, real estate, lodging
  6300: 'Insurance Sales & Premiums',
  6513: 'Real Estate Agents & Rentals',
  7011: 'Hotels & Motels',

  // Services & personal
  7210: 'Laundry & Cleaning Services',
  7211: 'Laundries (Family/Commercial)',
  7216: 'Dry Cleaners',
  7221: 'Photographic Studios (Portrait)',
  7299: 'Personal Services (Misc.)',
  7311: 'Advertising Services',
  7399: 'Business Services (Misc.)',

  // Entertainment, sports, attractions
  7832: 'Motion Picture Theaters',
  7911: 'Dance Halls, Schools & Studios',
  7941: 'Sports Clubs/Fields & Commercial Sports',
  7991: 'Tourist Attractions & Exhibits',
  7995: 'Betting, Lotteries & Gaming',
  7999: 'Recreation Services (Misc.)',

  // Government & postal
  9211: 'Court Costs',
  9222: 'Government Fines & Penalties',
  9311: 'Tax Payments',
  9399: 'Government Services (Misc.)',
  9402: 'Postal Services (Govt. Only)',

  // Extra money-movement (часто встречается у P2P)
  6536: 'MoneySend — Intracountry (P2P)',
  6537: 'MoneySend — Intercountry (P2P)',
  6540: 'Stored Value Card Purchase/Load',

  4215: 'Courier Services – Air & Ground, Freight Forwarders',
  7372: 'Computer Programming, Data Processing & Systems Design',
  7512: 'Automobile Rental',
  7538: 'Automotive Service Shops – General Repair (Non-Dealer)',
  7997: 'Clubs – Membership (Sports/Recreation/Athletic)',
  8071: 'Medical & Dental Laboratories',
  8021: 'Dentists & Orthodontists',
  8999: 'Professional Services – Not Elsewhere Classified',
  7542: 'Car Washes',
  7996: 'Amusement Parks, Carnivals & Circuses',
  5193: 'Florist Supplies, Nursery Stock & Flowers (Wholesale)',
  7922: 'Theatrical Producers & Ticket Agencies',
  8398: 'Charitable & Social Service Organizations',
  742: 'Veterinary Services',                     // иногда присылают как 742 (≙ 0742)
  7230: 'Barber & Beauty Shops',
  5262: 'Online Marketplaces (Multi-Merchant Platform)',
  5310: 'Discount Stores',
  8099: 'Medical Services – Other',
  7298: 'Health & Beauty Spas',
  7998: 'Aquariums, Zoos & Seaquariums',
  7379: 'Computer Maintenance, Repair & Related Services',
  7932: 'Billiard/Pool Establishments',
  7375: 'Information Retrieval Services',
};

export function mccName(mcc?: number | null): string {
  if (!mcc && mcc !== 0) return '—';
  return `${mcc} · ${MCC_LABELS[mcc] || 'Unknown'}`;
}
