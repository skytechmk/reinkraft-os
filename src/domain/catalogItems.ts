// Standard items offered as one-tap chips when adding an inventory item (blueprint section 3).
// Keyed by `${folder}/${subfolder}`. Names are in both languages; the unit must be one the subfolder allows.
import type { ProcessCode, Unit } from '../lib/types';

export interface CatalogItem {
  en: string;
  mk: string;
  unit: Unit;
  grade?: string;
  tags?: ProcessCode[];
  barLengthMm?: 3000 | 6000;
}

const MIG: ProcessCode[] = ['MIG', 'MAG'];
const TIG_ALL: ProcessCode[] = ['TIG_DC', 'TIG_ACDC'];
const TIG_DC: ProcessCode[] = ['TIG_DC'];
const TIG_AC: ProcessCode[] = ['TIG_ACDC'];

/** Steel tubes, flats and sections come in 6 m bars. */
const bar = (en: string, mk: string, grade?: string, len: 3000 | 6000 = 6000): CatalogItem => ({ en, mk, unit: 'BAR', grade, barLengthMm: len });
const item = (en: string, mk: string, unit: Unit, extra: Partial<CatalogItem> = {}): CatalogItem => ({ en, mk, unit, ...extra });

export const CATALOG: Record<string, CatalogItem[]> = {
  'RAW/PROFILES': [
    bar('Square tube 20x20x2', 'Квадратна цевка 20x20x2', 'S235'),
    bar('Square tube 40x40x2', 'Квадратна цевка 40x40x2', 'S235'),
    bar('Square tube 60x60x3', 'Квадратна цевка 60x60x3', 'S235'),
    bar('Rectangular tube 40x20x2', 'Правоаголна цевка 40x20x2', 'S235'),
    bar('Rectangular tube 60x40x2', 'Правоаголна цевка 60x40x2', 'S235'),
    bar('Round tube 33.7x2.6', 'Кружна цевка 33,7x2,6', 'S235'),
    bar('Round tube 48.3x2.9', 'Кружна цевка 48,3x2,9', 'S235'),
    bar('Flat bar 30x5', 'Флах челик 30x5', 'S235'),
    bar('Flat bar 40x8', 'Флах челик 40x8', 'S235'),
    bar('Angle 40x40x4', 'Аголник 40x40x4', 'S235'),
    bar('Angle 50x50x5', 'Аголник 50x50x5', 'S235'),
    bar('UNP 100', 'УНП 100', 'S235'),
    bar('UNP 140', 'УНП 140', 'S235'),
    bar('IPE 100', 'ИПЕ 100', 'S235'),
    bar('IPE 160', 'ИПЕ 160', 'S235'),
    bar('HEA 140', 'ХЕА 140', 'S235'),
    bar('Solid round bar 12 mm', 'Полна шипка 12 мм', 'S235'),
    bar('Solid square bar 12x12', 'Полна квадратна шипка 12x12', 'S235'),
    bar('Galvanized square tube 40x40x2', 'Поцинкувана квадратна цевка 40x40x2', 'Galv', 6000),
    bar('Galvanized round tube 48.3x2.9', 'Поцинкувана кружна цевка 48,3x2,9', 'Galv', 6000),
    bar('Stainless square tube 40x40x2', 'Инокс квадратна цевка 40x40x2', 'AISI 304', 6000),
    bar('Stainless round tube 42.4x2', 'Инокс кружна цевка 42,4x2', 'AISI 304', 6000),
    bar('Stainless round tube 48.3x2', 'Инокс кружна цевка 48,3x2 (316)', 'AISI 316', 6000),
    bar('Stainless flat bar 40x5', 'Инокс флах 40x5', 'AISI 304', 3000),
    bar('Aluminium square tube 40x40x2', 'Алуминиумска квадратна цевка 40x40x2', 'EN AW-6060', 6000),
    bar('Aluminium angle 40x40x3', 'Алуминиумски аголник 40x40x3', 'EN AW-6060', 6000),
    item('Profile by the metre', 'Профил по метар', 'M'),
  ],
  'RAW/SHEETS': [
    item('Black sheet 2 mm', 'Црн лим 2 мм', 'SHEET', { grade: 'S235' }),
    item('Black sheet 3 mm', 'Црн лим 3 мм', 'SHEET', { grade: 'S235' }),
    item('Black sheet 5 mm', 'Црн лим 5 мм', 'SHEET', { grade: 'S235' }),
    item('Galvanized sheet 1 mm', 'Поцинкуван лим 1 мм', 'SHEET', { grade: 'DX51D' }),
    item('Galvanized sheet 2 mm', 'Поцинкуван лим 2 мм', 'SHEET', { grade: 'DX51D' }),
    item('Stainless sheet 1.5 mm', 'Инокс лим 1,5 мм', 'SHEET', { grade: 'AISI 304' }),
    item('Stainless sheet 2 mm', 'Инокс лим 2 мм', 'SHEET', { grade: 'AISI 304' }),
    item('Stainless sheet 3 mm', 'Инокс лим 3 мм', 'SHEET', { grade: 'AISI 316' }),
    item('Checker plate 3 mm', 'Рифлан лим 3 мм', 'SHEET', { grade: 'S235' }),
    item('Checker plate 5 mm', 'Рифлан лим 5 мм', 'SHEET', { grade: 'S235' }),
    item('Aluminium sheet 2 mm', 'Алуминиумски лим 2 мм', 'SHEET', { grade: 'EN AW-5754' }),
    item('Expanded mesh', 'Растегнат лим (мрежа)', 'M2'),
    item('Welded mesh', 'Заварена мрежа', 'M2'),
    item('Sheet by weight', 'Лим по тежина', 'KG'),
  ],
  'RAW/ROOFING': [
    item('Trapezoidal roof sheet', 'Трапезен кровен лим', 'M2'),
    item('Trapezoidal roof sheet T18', 'Трапезен лим Т18', 'M'),
    item('Corrugated roof sheet', 'Бранет кровен лим', 'M2'),
    item('Sandwich panel 40 mm roof', 'Сендвич панел 40 мм за кров', 'M2'),
    item('Sandwich panel 50 mm wall', 'Сендвич панел 50 мм за ѕид', 'M2'),
    item('Sandwich panel 80 mm', 'Сендвич панел 80 мм', 'SHEET'),
    item('Ridge flashing', 'Слемен опшав', 'M'),
    item('Side flashing', 'Страничен опшав', 'M'),
  ],
  'RAW/LEXAN': [
    item('Cellular polycarbonate 6 mm', 'Ќелиски поликарбонат 6 мм', 'SHEET'),
    item('Cellular polycarbonate 10 mm', 'Ќелиски поликарбонат 10 мм', 'SHEET'),
    item('Cellular polycarbonate 16 mm', 'Ќелиски поликарбонат 16 мм', 'SHEET'),
    item('Solid Lexan 3 mm', 'Масивен лексан 3 мм', 'SHEET'),
    item('Solid Lexan 5 mm', 'Масивен лексан 5 мм', 'SHEET'),
    item('Lexan H profile', 'Лексан Н профил', 'M2'),
    item('Lexan U profile', 'Лексан У профил', 'M2'),
    item('Solid Lexan 8 mm', 'Масивен лексан 8 мм', 'SHEET'),
  ],
  'RAW/REMNANTS': [
    item('Tube offcut', 'Остаток од цевка', 'PCS'),
    item('Flat bar offcut', 'Остаток од флах', 'PCS'),
    item('Angle offcut', 'Остаток од аголник', 'PCS'),
    item('Section offcut', 'Остаток од профил', 'PCS'),
  ],

  'HARDWARE/GATES': [
    item('Weld-on hinge', 'Шарка за заварување', 'PCS'),
    item('Bearing hinge', 'Шарка со лежај', 'PCS'),
    item('Gate lock', 'Брава за порта', 'PCS'),
    item('Lock cylinder', 'Цилиндер за брава', 'PCS'),
    item('Door handle', 'Рачка за врата', 'PCS'),
    item('Gate latch', 'Резе за порта', 'PCS'),
    item('Door stopper', 'Стопер за врата', 'PCS'),
    item('Gate drop bolt', 'Подно резе за порта', 'PCS'),
  ],
  'HARDWARE/SLIDING': [
    item('V-groove wheel', 'Тркало со V-жлеб', 'PCS'),
    item('U-groove wheel', 'Тркало со U-жлеб', 'PCS'),
    item('Floor track', 'Подна шина', 'M'),
    item('Guide roller', 'Водечки ролер', 'PCS'),
    item('Gear rack', 'Запченаста летва', 'M'),
    item('Sliding gate carriage', 'Количка за лизгачка порта', 'PCS'),
    item('Top guide rail', 'Горна водилка', 'M'),
  ],
  'HARDWARE/CAPS': [
    item('Plastic tube end cap 40x40', 'Пластично капаче за цевка 40x40', 'PCS'),
    item('Plastic tube end cap round 48', 'Пластично капаче за кружна цевка 48', 'PCS'),
    item('Plastic tube end cap 60x40', 'Пластично капаче за цевка 60x40', 'PCS'),
    item('Forged rosette', 'Ковано цвеќе (розета)', 'PCS'),
    item('Forged leaf', 'Ковано лисје', 'PCS'),
    item('Forged spear finial', 'Ковано копје', 'PCS'),
  ],
  'HARDWARE/FASTENERS': [
    item('Bolt M8x40', 'Шраф М8x40', 'BOX'),
    item('Bolt M10x50', 'Шраф М10x50', 'BOX'),
    item('Nut M8', 'Навртка М8', 'BOX'),
    item('Nut M10', 'Навртка М10', 'BOX'),
    item('Concrete anchor M10', 'Анкер за бетон М10', 'PCS'),
    item('Chemical anchor stud M12', 'Хемиски анкер М12', 'PCS'),
    item('Self-drilling roof screw 5.5x38', 'Самобушачки кровен шраф 5,5x38', 'BOX'),
    item('Blind rivet 4.8x16', 'Попнитна 4,8x16', 'BOX'),
    item('Washer M10', 'Шајба М10', 'BOX'),
  ],

  'ABRASIVES/DISCS': [
    item('Cutting disc 115 mm steel', 'Диск за сечење 115 мм челик', 'BOX'),
    item('Cutting disc 125 mm steel', 'Диск за сечење 125 мм челик', 'BOX'),
    item('Cutting disc 125 mm inox', 'Диск за сечење 125 мм инокс', 'BOX'),
    item('Cutting disc 180 mm steel', 'Диск за сечење 180 мм челик', 'PCS'),
    item('Cutting disc 230 mm steel', 'Диск за сечење 230 мм челик', 'BOX'),
    item('Grinding disc 125 mm', 'Диск за брусење 125 мм', 'BOX'),
    item('Grinding disc 230 mm', 'Диск за брусење 230 мм', 'PCS'),
    item('Chop-saw disc 355 mm', 'Диск за ѓерунг пила 355 мм', 'PCS'),
    item('Bandsaw blade', 'Лист за тракаста пила', 'PCS'),
  ],
  'ABRASIVES/FLAP': [
    item('Flap disc 125 mm P40', 'Ламелен диск 125 мм П40', 'BOX'),
    item('Flap disc 125 mm P60', 'Ламелен диск 125 мм П60', 'BOX'),
    item('Flap disc 125 mm P80', 'Ламелен диск 125 мм П80', 'BOX'),
    item('Flap disc 125 mm P120', 'Ламелен диск 125 мм П120', 'BOX'),
    item('Fibre disc 125 mm', 'Фибер диск 125 мм', 'BOX'),
    item('Scotch-Brite inox wheel', 'Скоч-брајт тркало за инокс', 'PCS'),
    item('Wire brush 115 mm', 'Жичана четка 115 мм', 'PCS'),
    item('Wire cup brush', 'Жичана четка чаша', 'PCS'),
  ],
  'ABRASIVES/DRILLING': [
    item('HSS-G drill bit 6 mm', 'Бургија ХСС-Г 6 мм', 'PCS'),
    item('HSS-G drill bit 10 mm', 'Бургија ХСС-Г 10 мм', 'PCS'),
    item('HSS-Co drill bit 8 mm', 'Бургија ХСС-Ко 8 мм', 'PCS'),
    item('HSS-Co drill bit 12 mm', 'Бургија ХСС-Ко 12 мм', 'PCS'),
    item('Step drill 4-20 mm', 'Степенаста бургија 4-20 мм', 'PCS'),
    item('Tap M8', 'Навојник М8', 'PCS'),
    item('Tap M10', 'Навојник М10', 'PCS'),
  ],

  'CHEMICAL/PAINTS': [
    item('Anti-corrosive primer', 'Антикорозивен основен премаз', 'L'),
    item('Epoxy primer', 'Епоксиден основен премаз', 'L'),
    item('2K polyurethane topcoat', '2К полиуретанска завршна боја', 'L'),
    item('3-in-1 enamel', 'Емајл 3-во-1', 'L'),
    item('Wrought-iron paint', 'Боја за ковано железо', 'L'),
    item('Cold galvanizing zinc spray', 'Спреј за ладно поцинкување', 'PCS'),
    item('Spray paint', 'Спреј боја', 'PCS'),
  ],
  'CHEMICAL/THINNERS': [
    item('Nitro thinner', 'Нитро разредувач', 'L'),
    item('PU thinner', 'ПУ разредувач', 'L'),
    item('Acetone degreaser', 'Ацетон за одмастување', 'L'),
    item('Stainless pickling paste', 'Паста за декапирање на инокс', 'PCS'),
    item('Stainless passivation gel', 'Гел за пасивизација на инокс', 'L'),
    item('Cutting fluid', 'Течност за сечење', 'L'),
  ],

  'WELDING/MIG_MAG': [
    item('CO2 gas', 'ЦО2 гас', 'L', { tags: MIG }),
    item('Mix gas Ar/CO2 82/18', 'Мешан гас Ar/CO2 82/18', 'L', { tags: MIG }),
    item('MIG wire 0.8 mm', 'Жица за заварување 0,8 мм', 'KG', { grade: 'ER70S-6', tags: MIG }),
    item('MIG wire 1.0 mm', 'Жица за заварување 1,0 мм', 'KG', { grade: 'ER70S-6', tags: MIG }),
    item('MIG wire 1.2 mm', 'Жица за заварување 1,2 мм', 'KG', { grade: 'ER70S-6', tags: MIG }),
    item('Gas nozzle', 'Млазница за гас', 'PCS', { tags: MIG }),
    item('Contact tip 1.0 mm', 'Контактна млазница 1,0 мм', 'PCS', { tags: MIG }),
    item('Contact tip 1.2 mm', 'Контактна млазница 1,2 мм', 'PCS', { tags: MIG }),
    item('Diffuser', 'Дифузор', 'PCS', { tags: MIG }),
    item('Liner', 'Спирала (лајнер)', 'PCS', { tags: MIG }),
    item('Anti-spatter spray', 'Спреј против прскање', 'PCS', { tags: MIG }),
  ],
  'WELDING/TIG': [
    item('Pure argon', 'Чист аргон', 'L', { tags: TIG_ALL }),
    item('Tungsten 1.6 mm', 'Волфрамова електрода 1,6 мм', 'PCS', { tags: TIG_ALL }),
    item('Tungsten 2.4 mm', 'Волфрамова електрода 2,4 мм', 'PCS', { tags: TIG_ALL }),
    item('Tungsten 3.2 mm', 'Волфрамова електрода 3,2 мм', 'PCS', { tags: TIG_ALL }),
    item('Ceramic cup', 'Керамичка чаша', 'PCS', { tags: TIG_ALL }),
    item('Gas lens', 'Гас леќа', 'PCS', { tags: TIG_ALL }),
    item('Collet', 'Стега (колет)', 'PCS', { tags: TIG_ALL }),
    item('Collet body', 'Тело на стега', 'PCS', { tags: TIG_ALL }),
    item('Back cap', 'Задно капаче', 'PCS', { tags: TIG_ALL }),
    item('TIG rod ER70S-6', 'ТИГ прачка ER70S-6', 'KG', { grade: 'ER70S-6', tags: TIG_DC }),
    item('TIG rod ER308L', 'ТИГ прачка ER308L', 'KG', { grade: 'ER308L', tags: TIG_DC }),
    item('TIG rod ER316L', 'ТИГ прачка ER316L', 'KG', { grade: 'ER316L', tags: TIG_DC }),
    item('TIG rod ER309L', 'ТИГ прачка ER309L', 'KG', { grade: 'ER309L', tags: TIG_DC }),
    item('TIG rod ER312', 'ТИГ прачка ER312', 'KG', { grade: 'ER312', tags: TIG_DC }),
    item('Aluminium rod ER4043', 'Алуминиумска прачка ER4043', 'KG', { grade: 'ER4043', tags: TIG_AC }),
    item('Aluminium rod ER4047', 'Алуминиумска прачка ER4047', 'KG', { grade: 'ER4047', tags: TIG_AC }),
    item('Aluminium rod ER5356', 'Алуминиумска прачка ER5356', 'KG', { grade: 'ER5356', tags: TIG_AC }),
    item('Green tungsten 2.4 mm', 'Зелена волфрамова електрода 2,4 мм', 'PCS', { tags: TIG_AC }),
    item('Inox brush', 'Инокс четка', 'PCS', { tags: TIG_AC }),
  ],
  'WELDING/MMA': [
    item('Rutile electrodes 6013 2.5 mm', 'Рутилни електроди 6013 2,5 мм', 'KG', { grade: 'E6013', tags: ['MMA'] }),
    item('Rutile electrodes 6013 3.2 mm', 'Рутилни електроди 6013 3,2 мм', 'KG', { grade: 'E6013', tags: ['MMA'] }),
    item('Basic electrodes 7018 3.2 mm', 'Базни електроди 7018 3,2 мм', 'KG', { grade: 'E7018', tags: ['MMA'] }),
    item('Basic electrodes 7018 4.0 mm', 'Базни електроди 7018 4,0 мм', 'BOX', { grade: 'E7018', tags: ['MMA'] }),
    item('Stainless electrodes 308L 2.5 mm', 'Инокс електроди 308Л 2,5 мм', 'BOX', { grade: 'E308L', tags: ['MMA'] }),
    item('Stainless electrodes 316L 2.5 mm', 'Инокс електроди 316Л 2,5 мм', 'BOX', { grade: 'E316L', tags: ['MMA'] }),
    item('Cast iron electrodes', 'Електроди за леано железо', 'BOX', { tags: ['MMA'] }),
  ],
  'WELDING/PLASMA': [
    item('Plasma electrode', 'Плазма електрода', 'PCS', { tags: ['PLASMA'] }),
    item('Plasma cutting nozzle 1.0 mm', 'Плазма млазница за сечење 1,0 мм', 'PCS', { tags: ['PLASMA'] }),
    item('Plasma cutting tip 1.2 mm', 'Плазма врв за сечење 1,2 мм', 'PCS', { tags: ['PLASMA'] }),
    item('Plasma shield cap', 'Плазма заштитна капа', 'PCS', { tags: ['PLASMA'] }),
    item('Plasma swirl ring', 'Плазма вител прстен', 'PCS', { tags: ['PLASMA'] }),
  ],
  'WELDING/LASER': [
    item('Laser gas argon', 'Ласерски гас аргон', 'L', { tags: ['LASER'] }),
    item('Laser gas nitrogen', 'Ласерски гас азот', 'L', { tags: ['LASER'] }),
    item('Laser wire 0.8 mm', 'Ласерска жица 0,8 мм', 'M', { tags: ['LASER'] }),
    item('Laser wire 1.2 mm', 'Ласерска жица 1,2 мм', 'M', { tags: ['LASER'] }),
    item('Laser wire 1.6 mm', 'Ласерска жица 1,6 мм', 'M', { tags: ['LASER'] }),
    item('Protective window', 'Заштитно стакло', 'PCS', { tags: ['LASER'] }),
    item('Focus lens', 'Фокусна леќа', 'PCS', { tags: ['LASER'] }),
    item('Copper laser nozzle', 'Бакарна ласерска млазница', 'PCS', { tags: ['LASER'] }),
    item('Ceramic ring', 'Керамички прстен', 'PCS', { tags: ['LASER'] }),
  ],
};

export const catalogFor = (folder: string, subfolder: string): CatalogItem[] => CATALOG[`${folder}/${subfolder}`] ?? [];
