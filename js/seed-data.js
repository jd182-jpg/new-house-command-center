// SEED DATA: edit this file to change what a fresh (or reset) Command Center starts with.
// Everything here is editable and deletable inside the app too.
// Changes only show up after Settings > "Reset to seed data" (or on a brand new browser).
//
// Facts pulled from your 2608 Montrose folder are noted "From your docs".
// Anything Houston-specific that could change is marked "Confirm" in the hint.

// ---------- Rooms (feet) ----------
// w and l are in feet. Rooms without sizes still work, they just skip the fit check.
export const rooms = [
  { name: 'Entry', level: 1, w: 10, l: 15 },
  { name: 'Bedroom', level: 1, w: 15, l: 17 },
  { name: 'Bath', level: 1, w: 9, l: 8 },
  { name: 'Utility', level: 1, w: 8, l: 7 },
  { name: 'Living', level: 2, w: 25, l: 23 },
  { name: 'Kitchen', level: 2, w: 13, l: 19 },
  { name: 'Dining', level: 2, w: 10, l: 14 },
  { name: 'Primary BR', level: 3, w: 29, l: 19 },
  { name: 'Primary Bath', level: 3, w: 10, l: 13 },
  { name: 'Terrace', level: 3 },
  { name: 'Garage', level: 1 },
  { name: 'Whole house' },
];

export const settings = {
  closingDate: '',
  moveInDate: '',
  budget: null,
  roomBudgets: {},
  theme: 'auto',
};

// ---------- Tasks ----------
const T = (category, priority, title, hint, extra = {}) => ({ category, priority, title, hint, ...extra });

export const tasks = [
  // Utilities
  T('Utilities', 'High', 'Pick an electricity retail provider',
    'Houston power is deregulated: you choose a retail provider (REP), CenterPoint Energy owns the wires and meters. Compare plans at powertochoose.org. Read the Electricity Facts Label: watch for minimum-usage fees and teaser rates. A 12 month fixed plan is a safe default.',
    { link: 'https://www.powertochoose.org' }),
  T('Utilities', 'High', 'Set up natural gas service',
    'From your docs: the home is on natural gas (gas furnaces and a 2022 Rinnai tankless gas water heater per the 10/11 inspection). Gas in central Houston is CenterPoint Energy. Start service online with your move date. Confirm the provider for this address when you call.',
    { link: 'https://www.centerpointenergy.com/en-us/my-account/start-stop-transfer-reconnect-service/start' }),
  T('Utilities', 'High', 'Open water and sewer account with the City of Houston',
    'Start a new account by service address with Houston Public Works (Water). Ask how they handle the seller\'s final read. Confirm whether trash is billed on the water bill.',
    { link: 'https://www.houstonwaterbills.houstontx.gov' }),
  T('Utilities', 'Medium', 'Confirm trash and recycling for the community',
    'Confirm with the HOA: Montrose Townhouse Lofts is a gated community of 10 townhomes, so pickup could be City of Houston carts or an HOA hauler. City service covers townhomes in small communities, but HOAs can opt into private service. Then save trash day in Home Info.'),
  T('Utilities', 'High', 'Line up start dates with move-in, nothing left in seller\'s name',
    'Set every start date to closing day (or the day before). Ask each provider to confirm the seller\'s account is closed so you are not billed for their usage.'),
  T('Utilities', 'Medium', 'Final meter readings at closing',
    'Snap photos of the electric and gas meter readings at the walkthrough. From your docs: the inspection notes the meter bank is not clearly labeled, so ask the HOA which meter is yours.'),
  T('Utilities', 'High', 'Set up HOA dues and gate access',
    'From your docs: Montrose Townhouse Lofts Association, $577.84 per month. Closing collects a $350 transfer fee plus two months in advance. Contact is Julio at KRJ (713-600-4079, julio@krjcares.com). Ask for gate remotes, pool key, and how they want dues paid.',
    { contact: 'Julio (KRJ)', phone: '713-600-4079' }),
  T('Utilities', 'Medium', 'Plan the HVAC replacement',
    'From your docs: the inspection says the 1st floor furnace (2007) is past its service life. Autumn Mechanical quoted $10,522.34 on 10/15 for a Lennox 2 ton system with Wi-Fi thermostat. Register the equipment at lennox.com within 60 days of install for the 10 year parts warranty.',
    { contact: 'Autumn Mechanical', phone: '713-864-8368' }),
  T('Utilities', 'Low', 'Set up autopay on all utilities',
    'Once each account is live, turn on autopay with a card you check monthly. Paperless billing often knocks a few dollars off.'),
  T('Utilities', 'Low', 'Save every provider\'s phone number in Home Info',
    'Future you during an outage will be grateful. Home Info has a spot for each.'),

  // Internet and Wi-Fi
  T('Internet and Wi-Fi', 'High', 'Check which providers serve 2608 Montrose',
    'Enter the address on each provider site and on the FCC broadband map. Confirm availability: Montrose usually has AT&T Fiber and Xfinity cable; fiber is the pick if available (symmetric speeds). Gated communities sometimes have a bulk deal through the HOA, so ask Julio.',
    { link: 'https://broadbandmap.fcc.gov' }),
  T('Internet and Wi-Fi', 'High', 'Order service and book install for move-in week',
    'Install slots fill up. Book as soon as closing is firm. Ask where the line enters the house so the router can live on floor 2.'),
  T('Internet and Wi-Fi', 'Medium', 'Choose router and mesh setup for three floors',
    'Three floors plus concrete and stucco eat Wi-Fi. Plan one mesh node per floor, ideally wired back (the house is prewired for sound; check for ethernet). Put the main unit on floor 2, central and up high.'),
  T('Internet and Wi-Fi', 'Medium', 'Rename network, strong password, guest network',
    'Use a long passphrase. Make a separate guest network and save it in Home Info so guests get the QR code.'),
  T('Internet and Wi-Fi', 'Low', 'Set up streaming and smart home after install',
    'Apple TV, HomePods, Frame TV, thermostat, lock, doorbell, Vestaboard. Do these after the mesh is stable. Put smart devices on their own network if your router allows it.'),

  // Address Changes
  T('Address Changes', 'High', 'USPS change of address from Wisconsin',
    'Do it online at usps.com (small ID check fee). Pick a start date a day or two before move-in. Permanent forwarding lasts 12 months for first class mail.',
    { link: 'https://moversguide.usps.com' }),
  T('Address Changes', 'High', 'Get a Texas driver\'s license',
    'Confirm current rules at Texas DPS. New residents get 90 days. Register the car first; DPS asks for Texas vehicle registration and proof of insurance. Book an appointment online; slots run weeks out. Bring your Wisconsin license, proof of residency (closing docs or utility bill), and Social Security proof.',
    { link: 'https://www.dps.texas.gov/section/driver-license' }),
  T('Address Changes', 'High', 'Register and inspect the Audi Q5 in Texas',
    'Confirm current rules at TxDMV. New residents get 30 days to register. Harris County still requires an emissions inspection; Texas dropped most safety inspections in 2025, so check what applies. Then register at the Harris County Tax Office with your Wisconsin title, proof of Texas insurance, and inspection report.',
    { link: 'https://www.txdmv.gov/motorists/new-to-texas' }),
  T('Address Changes', 'Medium', 'Update voter registration',
    'Register in Texas at least 30 days before an election (confirm current deadline at votetexas.gov). Paper form or through DPS when you get your license.',
    { link: 'https://www.votetexas.gov' }),
  T('Address Changes', 'Medium', 'File homestead exemption with HCAD',
    'Confirm with HCAD: file between January 1 and April 30 for that tax year, early applications are not accepted. Closing in late 2026 means you file January 2027. Needs a Texas license showing this address. The HCAD mobile app takes it online.',
    { link: 'https://hcad.org/hcad-online-services/homestead/' }),
  T('Address Changes', 'High', 'Insurance: auto garaging and home policy with Tye Justice',
    'Update the State Farm auto policy to a Texas policy garaged at 77006, and bind the condo (HO6) policy effective at closing with Tye Justice. From your docs: you also have Hotchkiss quotes (GEICO auto $1,765 for 6 months paid in full; Mercury HO6 $2,668 per year, effective 11/13/2026) to compare against. The HOA master policy covers the building shell, so an HO6 with loss assessment coverage is the right type.',
    { contact: 'Tye Justice (State Farm)' }),
  T('Address Changes', 'Medium', 'Banks, credit cards, brokerage, retirement',
    'Update address on each, plus the mailing address for statements and tax forms. Do this before year-end so 1099s arrive at the new place.'),
  T('Address Changes', 'Medium', 'Employer and payroll: Leggett Capital Partners',
    'Update address with HR and in Paylocity, and update the W-4 state info. Texas has no state income tax, so stop any Wisconsin withholding.'),
  T('Address Changes', 'Medium', 'Rice registrar and student accounts',
    'Update your local address in Esther, plus student billing and any mail forwarding on campus.'),
  T('Address Changes', 'Medium', 'IRS and state tax records, residency note',
    'File IRS Form 8822 or just use the new address on your next return. Wisconsin residency: you may file a part-year Wisconsin return for 2026. Keep proof of the move date (closing statement, license date). Confirm with a tax pro.'),
  T('Address Changes', 'Low', 'Phone carrier, subscriptions, shopping, apps',
    'Phone carrier, Amazon, Apple, Google, DoorDash, Uber, airlines, loyalty programs. Update default shipping addresses before you order any furniture.'),
  T('Address Changes', 'Low', 'Doctors, dentist, and pharmacy',
    'Transfer prescriptions to a Houston pharmacy and request records if you switch doctors.'),
  T('Address Changes', 'Low', 'Send a new address note to friends and family',
    'A quick text or card. Bonus points for a housewarming date.'),

  // Mail
  T('Mail', 'Medium', 'Sign up for USPS Informed Delivery',
    'Free daily email preview of your mail. Needs the address verified, so do it right after closing.',
    { link: 'https://informeddelivery.usps.com' }),
  T('Mail', 'High', 'Get the mailbox key and location at closing',
    'Ask the seller or HOA which cluster box is yours and get the key at closing. If no key, the local post office can rekey it with proof of ownership.'),
  T('Mail', 'Low', 'Decide on a Wisconsin P.O. box or forwarding window',
    'Most people just use 12 months of USPS forwarding. Keep a P.O. box only if you expect important Wisconsin mail.'),
  T('Mail', 'Medium', 'Cover the gap between lease end and move-in',
    'If there are days between leaving the old place and moving in, use USPS Hold Mail or forward to a friend.'),
  T('Mail', 'Low', 'Create a 90 day mail triage routine',
    'Anything still coming to the old address is a missed change. Snap it, update the sender, and check it off.'),
  T('Mail', 'Low', 'Set up a returns pile for the seller\'s mail',
    'Write "Not at this address, return to sender" and drop it back in the box. Do not open it.'),
];

// ---------- Shopping ----------
// I(name, room, category, priority, extra)
// source: 'mine' = your list, 'suggested' = added because of your house, otherwise a starter item.
const I = (name, room, category, priority, extra = {}) => ({ name, room, category, priority, ...extra });
const mine = (extra = {}) => ({ source: 'mine', ...extra });
const sug = (notes, extra = {}) => ({ source: 'suggested', notes, ...extra });

export const items = [
  // ----- Your list -----
  I('Riedel wine glasses', 'Kitchen', 'Kitchenware', 'First week', mine({ notes: 'Pairs with the dry bar and wine fridge.' })),
  I('Apple HomePod', 'Living', 'Electronics', 'First week', mine({ notes: 'Consider a stereo pair for the living room.' })),
  I('Apple TV 4K', 'Living', 'Electronics', 'First week', mine()),
  I('Simplehuman trash can', 'Kitchen', 'Kitchenware', 'Before move-in', mine({ notes: 'Dual compartment for recycling.' })),
  I('Robot vacuum', 'Whole house', 'Cleaning', 'Later', mine({ notes: 'Three floors: pick one with multi-floor maps, or carry it. Safe on bamboo floors.' })),
  I('Samsung The Frame Pro', 'Living', 'Electronics', 'First week', mine({ notes: 'Replaces the generic TV. Comes with a slim wall mount; confirm size vs. the wall above the console.' })),
  I('Peloton Tread', 'Bedroom', 'Fitness', 'Later', mine({ notes: 'Heavy (roughly 290 lb, confirm). Floor 1 avoids the stairs; Peloton delivers and assembles. Check ceiling height for running.', dims: { w: 33, d: 68, h: 62 } })),
  I('Mattress', 'Primary BR', 'Furniture', 'Before move-in', mine({ notes: 'King per the floor plan. Bed-in-a-box rolls up the stairs easily.', stairOk: 'Yes' })),
  I('Eight Sleep Pod', 'Primary BR', 'Wellness', 'First week', mine({ notes: 'Order the cover to match the mattress size. Needs an outlet near the bed.' })),
  I('Air purifier', 'Primary BR', 'Wellness', 'First week', mine({ notes: 'Size it for a 551 sq ft room.' })),
  I('Thomas Keller cookware', 'Kitchen', 'Kitchenware', 'Before move-in', mine({ notes: 'Replaces a generic pots and pans set. The kitchen has an induction cooktop, so confirm the set is induction ready.' })),
  I('Dyson vacuum', 'Whole house', 'Cleaning', 'Before move-in', mine({ notes: 'Cordless is easiest across three floors.' })),
  I('Michael Snodgrass art', 'Living', 'Art and decor', 'Later', mine({ notes: 'Lots of uninterrupted wall space in the living room.' })),
  I('KitchenAid stand mixer', 'Kitchen', 'Appliances', 'Later', mine()),
  I('Smart thermostats', 'Whole house', 'Smart home', 'First week', mine({ qty: 2, notes: 'From your docs: HVAC is zoned with two systems (floor 1 and floors 2 to 3), so plan on two. The Autumn Mechanical quote includes one Wi-Fi thermostat.' })),
  I('Smart lock', 'Entry', 'Smart home', 'Before move-in', mine({ notes: 'Rekey or replace locks on day one. Check the HOA rules on exterior hardware.' })),
  I('Video doorbell', 'Entry', 'Smart home', 'First week', mine({ notes: 'Gated community: check with the HOA before mounting outside.' })),
  I('Coffee maker', 'Kitchen', 'Appliances', 'Before move-in', mine()),
  I('Art', 'Whole house', 'Art and decor', 'Later', mine({ notes: 'Western black and white photography, oversized frames.' })),
  I('Vestaboard', 'Kitchen', 'Smart home', 'Later', mine({ notes: 'Needs Wi-Fi and a wall with an outlet nearby.' })),

  // ----- Living (floor 2) -----
  I('Sofa (modular or knock-down)', 'Living', 'Furniture', 'First week', { notes: 'Floor plan shows an 8 ft sofa. Modular or knock-down for the stairs.', dims: { w: 96, d: 38, h: 32 } }),
  I('Leather chair', 'Living', 'Furniture', 'First week', { notes: 'Cognac or saddle leather.' }),
  I('Living room rug', 'Living', 'Bedding and textiles', 'First week', { notes: 'Floor plan suggests 9x12.', dims: { w: 144, d: 108 } }),
  I('Coffee table', 'Living', 'Furniture', 'First week', { notes: 'Rustic wood and black metal. Leave 14 to 18 in to the sofa.' }),
  I('Side tables', 'Living', 'Furniture', 'Later', { qty: 2 }),
  I('Media console', 'Living', 'Furniture', 'First week'),
  I('Lamps with warm bulbs', 'Living', 'Lighting', 'First week', { qty: 2, notes: '2700K bulbs for the warm, moody look.' }),
  I('Curtains', 'Living', 'Bedding and textiles', 'Later', { notes: 'Walls of glass: measure carefully, may need custom.' }),

  // ----- Primary BR (floor 3) -----
  I('Platform bed', 'Primary BR', 'Furniture', 'Before move-in', { notes: 'King. Platform or split box spring for the stairs.', dims: { w: 80, d: 86, h: 40 } }),
  I('Nightstands', 'Primary BR', 'Furniture', 'First week', { qty: 2 }),
  I('Dresser', 'Primary BR', 'Furniture', 'First week'),
  I('Bedding set', 'Primary BR', 'Bedding and textiles', 'Before move-in', { notes: 'Sheets, duvet, pillows. A second sheet set too.' }),
  I('Blackout curtains', 'Primary BR', 'Bedding and textiles', 'Before move-in'),
  I('Primary bedroom rug', 'Primary BR', 'Bedding and textiles', 'Later', { notes: 'Floor plan suggests 10x12.' }),
  I('Desk or sitting zone', 'Primary BR', 'Furniture', 'Later', { notes: 'The study nook from the listing.' }),
  I('Primary bedroom art', 'Primary BR', 'Art and decor', 'Later'),

  // ----- Bedroom (floor 1) -----
  I('Guest bed', 'Bedroom', 'Furniture', 'Later', { notes: 'Floor plan shows a queen.' }),
  I('Desk', 'Bedroom', 'Furniture', 'First week'),
  I('Dresser (guest)', 'Bedroom', 'Furniture', 'Later'),
  I('Desk lamp', 'Bedroom', 'Lighting', 'First week'),
  I('Guest room rug', 'Bedroom', 'Bedding and textiles', 'Later', { notes: 'Floor plan suggests 8x10.' }),
  I('Guest curtains', 'Bedroom', 'Bedding and textiles', 'Later'),

  // ----- Dining (floor 2) -----
  I('Dining table', 'Dining', 'Furniture', 'Later', { notes: 'Max 42 in wide (floor plan flags the room as tight).', dims: { w: 72, d: 42 } }),
  I('Dining chairs', 'Dining', 'Furniture', 'Later', { qty: 4 }),
  I('Dining rug', 'Dining', 'Bedding and textiles', 'Later', { notes: 'Floor plan suggests 8x10.' }),
  I('Dining light fixture', 'Dining', 'Lighting', 'Later', { notes: 'Black metal, warm bulbs. Hire an electrician to swap.' }),
  I('Sideboard', 'Dining', 'Furniture', 'Later'),

  // ----- Kitchen (floor 2) -----
  I('Knife set', 'Kitchen', 'Kitchenware', 'Before move-in'),
  I('Cutting boards', 'Kitchen', 'Kitchenware', 'Before move-in', { qty: 2 }),
  I('Dishes', 'Kitchen', 'Kitchenware', 'Before move-in'),
  I('Everyday glasses', 'Kitchen', 'Kitchenware', 'Before move-in'),
  I('Flatware', 'Kitchen', 'Kitchenware', 'Before move-in'),
  I('Mugs', 'Kitchen', 'Kitchenware', 'Before move-in'),
  I('Baking sheets', 'Kitchen', 'Kitchenware', 'Later'),
  I('Mixing bowls', 'Kitchen', 'Kitchenware', 'First week'),
  I('Cooking utensils', 'Kitchen', 'Kitchenware', 'Before move-in'),
  I('Kettle', 'Kitchen', 'Appliances', 'First week'),
  I('Toaster', 'Kitchen', 'Appliances', 'First week'),
  I('Blender', 'Kitchen', 'Appliances', 'Later'),
  I('Dish rack', 'Kitchen', 'Kitchenware', 'Before move-in'),
  I('Dish towels', 'Kitchen', 'Bedding and textiles', 'Before move-in'),
  I('Food storage containers', 'Kitchen', 'Kitchenware', 'First week'),
  I('Spice rack', 'Kitchen', 'Storage', 'Later'),
  I('Pantry basics', 'Kitchen', 'Pantry and supplies', 'First week', { notes: 'Olive oil, salt, pepper, coffee, snacks.' }),
  I('Kitchen cleaning supplies', 'Kitchen', 'Cleaning', 'Before move-in', { notes: 'Dish soap, dishwasher pods, sponges, granite-safe spray.' }),

  // ----- Utility (floor 1) -----
  I('Washer and dryer', 'Utility', 'Appliances', 'Before move-in', { notes: 'From your docs: the listing says the washer and dryer convey. Confirm at the final walkthrough; only buy if not. If buying, confirm door width of at least 29 in.' }),
  I('Laundry basket', 'Utility', 'Storage', 'Before move-in'),
  I('Iron and board', 'Utility', 'Other', 'Later'),
  I('Utility shelving', 'Utility', 'Storage', 'First week'),
  I('Cleaning closet organizer', 'Utility', 'Storage', 'Later'),

  // ----- Bathrooms -----
  I('Towels (primary)', 'Primary Bath', 'Bath', 'Before move-in', { qty: 4 }),
  I('Bath mat (primary)', 'Primary Bath', 'Bath', 'Before move-in'),
  I('Bathroom trash can (primary)', 'Primary Bath', 'Bath', 'Before move-in'),
  I('Bathroom storage (primary)', 'Primary Bath', 'Storage', 'Later'),
  I('Towels (guest)', 'Bath', 'Bath', 'First week', { qty: 2 }),
  I('Shower curtain', 'Bath', 'Bath', 'Before move-in', { notes: 'Floor plan shows a tub in the floor 1 bath.' }),
  I('Bath mat (guest)', 'Bath', 'Bath', 'First week'),
  I('Bathroom trash can (guest)', 'Bath', 'Bath', 'First week'),
  I('Toiletries', 'Primary Bath', 'Pantry and supplies', 'Before move-in'),
  I('Toilet paper', 'Whole house', 'Pantry and supplies', 'Before move-in', { notes: 'Three bathrooms. Buy the big pack.' }),

  // ----- Entry (floor 1) -----
  I('Entry bench or console', 'Entry', 'Furniture', 'First week', { notes: 'Floor plan shows a bench.' }),
  I('Wall hooks', 'Entry', 'Storage', 'First week'),
  I('Shoe storage', 'Entry', 'Storage', 'First week'),
  I('Entry mirror', 'Entry', 'Art and decor', 'Later'),
  I('Doormat', 'Entry', 'Bedding and textiles', 'Before move-in'),

  // ----- Whole house -----
  I('Mop and bucket', 'Whole house', 'Cleaning', 'Before move-in', { notes: 'Bamboo floors: use a damp (not wet) microfiber mop and wood-safe cleaner.' }),
  I('Broom and dustpan', 'Whole house', 'Cleaning', 'Before move-in'),
  I('Step stool', 'Whole house', 'Tools and safety', 'First week', { notes: 'Soaring ceilings: consider a tall ladder too.' }),
  I('Toolkit', 'Whole house', 'Tools and safety', 'Before move-in'),
  I('Drill', 'Whole house', 'Tools and safety', 'First week'),
  I('Extension cords', 'Whole house', 'Tools and safety', 'Before move-in'),
  I('Light bulbs', 'Whole house', 'Lighting', 'Before move-in', { notes: 'Warm 2700K. Check existing fixture sizes first.' }),
  I('Smoke and CO detectors', 'Whole house', 'Tools and safety', 'Before move-in', { notes: 'Gas home: a CO detector on every floor. Test existing smoke detectors on move-in day.' }),
  I('Fire extinguisher', 'Whole house', 'Tools and safety', 'Before move-in', { qty: 2, notes: 'One for the kitchen, one in the garage.' }),
  I('First aid kit', 'Whole house', 'Tools and safety', 'Before move-in'),
  I('Batteries', 'Whole house', 'Tools and safety', 'Before move-in'),
  I('Hangers', 'Whole house', 'Storage', 'Before move-in'),
  I('Storage bins', 'Whole house', 'Storage', 'First week'),
  I('Plants', 'Whole house', 'Art and decor', 'Later'),

  // ----- Art and decor -----
  I('Frames', 'Whole house', 'Art and decor', 'Later'),
  I('Picture-hanging kit', 'Whole house', 'Tools and safety', 'First week'),
  I('Mirrors', 'Whole house', 'Art and decor', 'Later'),
  I('Vases', 'Whole house', 'Art and decor', 'Later'),
  I('Throw blankets', 'Living', 'Bedding and textiles', 'Later'),
  I('Candles', 'Whole house', 'Art and decor', 'Later'),

  // ----- Suggested for this house -----
  I('Mesh Wi-Fi system (3 nodes)', 'Whole house', 'Electronics', 'Before move-in',
    sug('Three floors of stucco and glass. One node per floor, main unit on floor 2.', { qty: 1 })),
  I('Surge protectors', 'Whole house', 'Electronics', 'Before move-in',
    sug('For the Frame TV, Apple TV, Peloton, and office gear.', { qty: 4 })),
  I('Felt furniture pads', 'Whole house', 'Tools and safety', 'Before move-in',
    sug('Bamboo floors scratch easily. Pad everything before it lands.')),
  I('Dryer vent cleaning kit', 'Utility', 'Cleaning', 'First week',
    sug('From your docs: the inspection recommends periodic dryer vent cleaning.')),
  I('Plunger and toilet brushes', 'Whole house', 'Cleaning', 'Before move-in',
    sug('Three bathrooms. Buy before you need one.', { qty: 3 })),
  I('Shower squeegee and hard water cleaner', 'Primary Bath', 'Cleaning', 'First week',
    sug('From your docs: the inspection noted hard water stains.')),
  I('Water filter pitcher', 'Kitchen', 'Kitchenware', 'First week',
    sug('Houston tap water tastes better filtered.')),
  I('Bar tools and decanter', 'Kitchen', 'Kitchenware', 'Later',
    sug('The house has a dry bar and wine fridge. Shaker, jigger, opener, decanter.')),
  I('Terrace lounge chairs', 'Terrace', 'Outdoor', 'Later',
    sug('Expansive terrace off the primary. Weather resistant teak or powder coated metal.', { qty: 2 })),
  I('Outdoor rug and planters', 'Terrace', 'Outdoor', 'Later',
    sug('Check HOA plant rules (there is a Sec. 7.04 plants resolution in your HOA folder).')),
  I('Garage shelving', 'Garage', 'Storage', 'First week',
    sug('Two car garage is your main storage. Wall shelves keep the floor clear.')),
  I('Window treatments for walls of glass', 'Living', 'Bedding and textiles', 'Later',
    sug('Houston sun is intense. Ask the designer about solar shades for the big windows.')),
  I('Moving supplies', 'Whole house', 'Pantry and supplies', 'Before move-in',
    sug('Boxes, tape, markers, furniture blankets, a dolly for three floors.')),
  I('Hurricane kit', 'Whole house', 'Tools and safety', 'Later',
    sug('Water, flashlights, power bank, and a weather radio. Hurricane season runs June to November.')),
];

// ---------- Home Info ----------
// Stored only in your browser. Never put passwords for bank or email accounts here.
export const homeInfo = {
  address: '2608 Montrose Blvd, Houston, TX 77006',
  wifiName: '',
  wifiPassword: '',
  guestWifiName: '',
  guestWifiPassword: '',
  internetProvider: '',
  internetContact: '',
  trashDay: '',
  notes: 'From your docs: zoned HVAC (1st floor furnace from 2007, Trane on floors 2 and 3 from 2020). 2022 Rinnai tankless gas water heater. Electric fireplace. Owned alarm system, wired for sound, automated lighting. Front door faces east. FEMA flood zone X.',
  utilities: [
    { name: 'Electricity (retail provider)', provider: '', phone: '' },
    { name: 'Electric wires and outages', provider: 'CenterPoint Energy', phone: '' },
    { name: 'Natural gas', provider: 'CenterPoint Energy (confirm)', phone: '' },
    { name: 'Water and sewer', provider: 'City of Houston', phone: '311' },
    { name: 'Trash and recycling', provider: '', phone: '' },
  ],
  contacts: [
    { role: 'Agent', name: 'Leah Leggett', phone: '832-259-6808', email: 'leah@leggettprops.com' },
    { role: 'Designer', name: '', phone: '', email: '' },
    { role: 'Insurance agent', name: 'Tye Justice (State Farm)', phone: '', email: '' },
    { role: 'Policy contact', name: '', phone: '', email: '' },
    { role: 'HOA (KRJ Management)', name: 'Julio', phone: '713-600-4079', email: 'julio@krjcares.com' },
    { role: 'HVAC', name: 'Autumn Mechanical', phone: '713-864-8368', email: '' },
  ],
};

// ---------- Updates ----------
// New facts for data you are already using. Each update runs once per device's data (it is
// remembered by id), only fills blanks in settings, adds tasks by id, and edits seeded tasks
// and items by exact title or name. To add more later, append a new object with a new id.
const C = (id, priority, due, title, hint, extra = {}) => ({ id, category: 'Closing', priority, due, title, hint, ...extra });
const CLOSING_IDS = ['closing-hoa-docs', 'closing-title-commitment', 'closing-survey', 'closing-objections',
  'closing-insurance-leaseback', 'closing-settlement', 'closing-repair-docs', 'closing-wire', 'closing-walkthrough',
  'closing-day', 'closing-leaseback-end', 'closing-deposit-refund', 'closing-stucco'];

export const updates = [
  {
    id: '2026-10-18-contract-dates',
    settings: { closingDate: '2026-11-13', moveInDate: '2026-11-20' },
    addTasks: [
      C('closing-hoa-docs', 'High', '2026-10-20', 'Confirm when the HOA documents were delivered',
        'The seller owed you the HOA documents within 7 days of the 10/8 effective date, so by 10/15. Your folder has a resale certificate signed 10/14. Ask Leah for the date you officially received the full packet: you can still terminate within 3 days of receiving them, even though you waived the option period.',
        { contact: 'Leah Leggett', phone: '832-259-6808' }),
      C('closing-title-commitment', 'High', '2026-10-28', 'Get the title commitment from Alamo Title',
        'The seller delivers it within 20 days after Alamo Title receives the contract, so about 10/28. Your 5 day objection clock starts once you have both the commitment and the survey.',
        { contact: 'Alamo Title' }),
      C('closing-survey', 'Medium', '2026-10-29', 'Decide whether to order a new survey',
        'The window to order a new survey at your expense closes 10/29. If you skip it, plan on the survey amendment cost at closing.'),
      C('closing-objections', 'High', '2026-11-03', 'Review title and survey, send any objections',
        'You have 5 days after receiving both the commitment and the survey to object. Update this due date once both arrive. Closing can slip to 7 days after objections are cured or waived.'),
      C('closing-insurance-leaseback', 'High', '2026-11-06', 'Tell Tye about the seller leaseback',
        'Both the contract and the lease say the seller staying in possession can change coverage. Make sure the policy you bind for 11/13 fits a seller-occupied week (11/13 to 11/20).',
        { contact: 'Tye Justice (State Farm)' }),
      C('closing-settlement', 'High', '2026-11-10', 'Check the settlement statement: price $614,584',
        'The repair amendment you both signed on 10/17 sets the price at $614,584. The earlier $590,000 amendment was only signed by you, so it should not apply, and the original contract said $630,000. Your $6,300 earnest money and $750 option fee are credited, leaving about $607,534 plus closing costs (half the escrow fee, the survey amendment, up to $350 in HOA transfer fees).'),
      C('closing-repair-docs', 'Medium', '2026-11-10', 'Collect repair invoices and warranties from the seller',
        'Due 3 days before closing (11/10 for an 11/13 closing). Save copies with your house documents.'),
      C('closing-wire', 'High', '2026-11-12', 'Verify wiring instructions by phone, then wire funds',
        'Call Alamo Title at a number you looked up yourself, never one from an email, and confirm the instructions before sending. Wire fraud targets closings. Roughly $607,534 plus closing costs; use the final figure from the settlement statement.',
        { contact: 'Alamo Title' }),
      C('closing-walkthrough', 'High', '2026-11-12', 'Final walkthrough',
        'Check the repairs from the amendment, and that the refrigerator, washer, and dryer are there and working (they convey). Photograph anything off.'),
      C('closing-day', 'High', '2026-11-13', 'Closing day at Alamo Title',
        'Bring ID. Confirm the leaseback rent is collected at funding: $200 per day for the whole term (7 days is $1,400), plus the $1,000 deposit.'),
      C('closing-leaseback-end', 'High', '2026-11-20', 'Leaseback ends: get possession',
        'The end date is fixed at 11/20 even if closing slips. Confirm the seller is out, the home was professionally cleaned, and you have every key, gate remote, pool key, and the mailbox key. Holdover is $500 per day past 11/20.'),
      C('closing-deposit-refund', 'Medium', '2026-12-20', 'Refund the seller\'s $1,000 lease deposit',
        'Due within 30 days after he moves out (12/20 if he leaves 11/20). Deduct only for damage or unpaid holdover, in writing.'),
      C('closing-stucco', 'Medium', '2027-03-13', 'Stucco repairs and escrow claim deadline',
        'Repairs and the escrow claim are due 120 days after closing, about 3/13/2027 for an 11/13 closing. Line up the stucco contractor early in the new year.'),
    ],
    editTasks: [
      { title: 'Line up start dates with move-in, nothing left in seller\'s name', set: {
        'due?': '2026-11-06',
        hint: 'The seller pays every utility during the leaseback (11/13 to 11/20), so start your service on 11/20. Schedule it about two weeks ahead, and ask each provider to close the seller\'s account that day so you are not billed for his usage.' } },
      { title: 'Final meter readings at closing', set: {
        hint: 'Since the seller pays utilities through the leaseback, take photos of the electric and gas meter readings on 11/20 when you get possession. From your docs: the meter bank is not clearly labeled, so ask the HOA which meter is yours.' } },
      { title: 'Order service and book install for move-in week', set: {
        hint: 'Book the install for the week of 11/20, after the leaseback ends. Ask where the line enters the house so the router can live on floor 2.' } },
      { title: 'Get the mailbox key and location at closing', set: {
        hint: 'The seller stays until 11/20, so get the mailbox key when the leaseback ends. Ask which cluster box is yours. If there is no key, the post office can rekey it with proof of ownership.' } },
      { title: 'USPS change of address from Wisconsin', set: { 'due?': '2026-11-13' } },
    ],
    editItems: [
      { name: 'Washer and dryer', set: { status: 'Placed', notes: 'Conveys with the house per the contract, along with the refrigerator. Nothing to buy. Check they work at the walkthrough.' } },
    ],
    addContacts: [
      { role: 'Title company', name: 'Alamo Title', phone: '', email: '' },
    ],
    appendNotes: 'Contract: price $614,584 (repair amendment signed 10/17). Closing on or before 11/13/2026 at Alamo Title. Seller leaseback 11/13 to 11/20 at $200 per day, $1,000 deposit, $500 per day holdover. Refrigerator, washer, and dryer convey.',
  },
  {
    // A device running a cached copy of the older app filed the closing tasks under Utilities.
    id: '2026-10-26-closing-category',
    editTasks: CLOSING_IDS.map((id) => ({ id, set: { category: 'Closing' } })),
  },
  {
    // Everything not yet bought starts over as a suggestion; a brand or link moves it to To purchase.
    id: '2026-10-26-shopping-suggested',
    unboughtItemsTo: 'Suggested',
  },
];

export default { rooms, settings, tasks, items, homeInfo, updates };
