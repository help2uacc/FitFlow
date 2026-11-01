/**
 * Built-in food catalog (values per 100 g edible portion).
 *
 * Sources & licensing (see docs/DATA_SOURCES.md):
 *  - "usda_sr":   USDA FoodData Central, SR Legacy. Public domain (CC0 1.0).
 *                 Values were transcribed per 100 g; confidence "medium" because
 *                 they were entered manually and rounded — verify before clinical use.
 *  - "label":     Typical manufacturer label values for generic products (confidence "low").
 *  - "estimate":  FitFlow estimates for Iranian prepared dishes computed from
 *                 standard home recipes (confidence "low"). Real values vary by recipe.
 */
export interface FoodSeed {
  id: string; fa: string; en: string; cat: string; state: "raw" | "cooked" | "prepared" | "na";
  servingG: number; serving: string; kcal: number; p: number; c: number; f: number; fiber?: number;
  tags: string[]; cost: 1 | 2 | 3; src: "usda_sr" | "label" | "estimate";
}

export const FOOD_SOURCES = [
  { id: "usda_sr", name: "USDA FoodData Central — SR Legacy", url: "https://fdc.nal.usda.gov/", license: "Public domain (CC0 1.0)", notes: "Per-100 g values transcribed and rounded; confidence medium." },
  { id: "label", name: "Typical manufacturer label values", url: null, license: "Facts (not copyrightable)", notes: "Generic product averages; actual products vary." },
  { id: "estimate", name: "FitFlow recipe-composition estimate", url: null, license: "Original FitFlow content", notes: "Estimated from standard home recipes; low confidence." },
  { id: "user", name: "User-defined", url: null, license: "User content", notes: "Entered by the user." },
] as const;

const F = (id: string, fa: string, en: string, cat: string, state: FoodSeed["state"], servingG: number, serving: string,
  kcal: number, p: number, c: number, f: number, tags: string[], cost: 1 | 2 | 3, src: FoodSeed["src"], fiber?: number): FoodSeed =>
  ({ id, fa, en, cat, state, servingG, serving, kcal, p, c, f, fiber, tags, cost, src });

export const FOODS: FoodSeed[] = [
  // ---- protein (animal)
  F("chicken_breast", "سینه مرغ پخته (بدون پوست)", "Chicken breast, roasted, skinless", "protein", "cooked", 120, "۱ کف دست (۱۲۰ گرم)", 165, 31, 0, 3.6, ["protein", "main", "meat", "animal"], 2, "usda_sr", 0),
  F("chicken_thigh", "ران مرغ پخته (بدون پوست)", "Chicken thigh, roasted, meat only", "protein", "cooked", 120, "۱ عدد متوسط (۱۲۰ گرم)", 209, 26, 0, 10.9, ["protein", "main", "meat", "animal"], 2, "usda_sr", 0),
  F("beef_lean_ground", "گوشت چرخ‌کرده کم‌چرب پخته", "Ground beef 90% lean, pan-browned", "protein", "cooked", 100, "۱۰۰ گرم", 217, 26.1, 0, 11.7, ["protein", "main", "meat", "red_meat", "animal"], 3, "usda_sr", 0),
  F("beef_stew", "گوشت قرمز خورشتی پخته (لخم)", "Beef chuck, lean, braised", "protein", "cooked", 100, "۱۰۰ گرم", 213, 31, 0, 8.9, ["protein", "main", "meat", "red_meat", "animal"], 3, "usda_sr", 0),
  F("lamb_leg", "گوشت ران گوسفند پخته (لخم)", "Lamb leg, lean, roasted", "protein", "cooked", 100, "۱۰۰ گرم", 191, 28.3, 0, 7.7, ["protein", "main", "meat", "red_meat", "animal"], 3, "usda_sr", 0),
  F("salmon", "ماهی سالمون پخته", "Atlantic salmon, farmed, cooked", "protein", "cooked", 120, "۱ تکه (۱۲۰ گرم)", 206, 22.1, 0, 12.4, ["protein", "main", "fish", "seafood", "animal"], 3, "usda_sr", 0),
  F("white_fish", "ماهی سفید/تیلاپیا پخته", "Tilapia, cooked, dry heat", "protein", "cooked", 120, "۱ تکه (۱۲۰ گرم)", 128, 26.2, 0, 2.7, ["protein", "main", "fish", "seafood", "animal"], 2, "usda_sr", 0),
  F("tuna_water", "تن ماهی در آب (آبکش‌شده)", "Tuna, light, canned in water, drained", "protein", "na", 100, "۱ قوطی کوچک (۱۰۰ گرم)", 116, 25.5, 0, 0.8, ["protein", "main", "snack", "fish", "seafood", "animal"], 2, "usda_sr", 0),
  F("shrimp", "میگو پخته", "Shrimp, cooked", "protein", "cooked", 100, "۱۰۰ گرم", 99, 24, 0.2, 0.3, ["protein", "main", "seafood", "animal"], 3, "usda_sr", 0),
  F("sardine", "ساردین کنسرو (آبکش‌شده)", "Sardines, canned in oil, drained", "protein", "na", 90, "۱ قوطی (۹۰ گرم)", 208, 24.6, 0, 11.5, ["protein", "main", "fish", "seafood", "animal"], 2, "usda_sr", 0),
  F("egg", "تخم‌مرغ آب‌پز", "Egg, whole, hard-boiled", "protein", "cooked", 50, "۱ عدد (۵۰ گرم)", 155, 12.6, 1.1, 10.6, ["protein", "breakfast", "snack", "egg", "animal"], 1, "usda_sr", 0),
  F("egg_white", "سفیده تخم‌مرغ", "Egg white, raw", "protein", "raw", 33, "سفیده ۱ عدد (۳۳ گرم)", 52, 10.9, 0.7, 0.2, ["protein", "breakfast", "egg", "animal"], 1, "usda_sr", 0),
  // ---- dairy
  F("milk_lowfat", "شیر کم‌چرب (۱٪)", "Milk, 1% fat", "dairy", "na", 240, "۱ لیوان (۲۴۰ گرم)", 42, 3.4, 5, 1, ["dairy", "breakfast", "snack", "lactose", "animal"], 1, "usda_sr", 0),
  F("yogurt_lowfat", "ماست کم‌چرب", "Yogurt, plain, low fat", "dairy", "na", 150, "۱ کاسه کوچک (۱۵۰ گرم)", 63, 5.3, 7, 1.6, ["dairy", "snack", "main_side", "lactose", "animal"], 1, "usda_sr", 0),
  F("greek_yogurt", "ماست یونانی (چکیده) کم‌چرب", "Greek yogurt, plain, nonfat", "dairy", "na", 150, "۱ کاسه کوچک (۱۵۰ گرم)", 59, 10.2, 3.6, 0.4, ["dairy", "protein", "snack", "breakfast", "lactose", "animal"], 2, "usda_sr", 0),
  F("cottage_cheese", "پنیر کاتیج کم‌چرب", "Cottage cheese, lowfat 2%", "dairy", "na", 100, "۱۰۰ گرم", 84, 11, 4.3, 2.3, ["dairy", "protein", "breakfast", "snack", "lactose", "animal"], 2, "usda_sr", 0),
  F("white_cheese", "پنیر سفید ایرانی", "Iranian white brined cheese (feta-style)", "dairy", "na", 30, "۱ قوطی کبریت (۳۰ گرم)", 264, 14.2, 4.1, 21.3, ["dairy", "breakfast", "lactose", "animal"], 1, "usda_sr", 0),
  F("doogh", "دوغ کم‌نمک", "Doogh (diluted yogurt drink)", "dairy", "na", 250, "۱ لیوان (۲۵۰ گرم)", 30, 1.7, 2.3, 1.4, ["dairy", "drink", "lactose", "animal"], 1, "estimate", 0),
  F("kashk", "کشک مایع", "Kashk (liquid whey)", "dairy", "na", 30, "۲ قاشق غذاخوری (۳۰ گرم)", 120, 10, 6, 6, ["dairy", "lactose", "animal"], 1, "estimate", 0),
  // ---- plant protein
  F("lentils", "عدس پخته", "Lentils, boiled", "legume", "cooked", 150, "۱ پیمانه کوچک (۱۵۰ گرم)", 116, 9, 20.1, 0.4, ["protein", "carb", "main", "legume", "vegan"], 1, "usda_sr", 7.9),
  F("chickpeas", "نخود پخته", "Chickpeas, boiled", "legume", "cooked", 150, "۱ پیمانه کوچک (۱۵۰ گرم)", 164, 8.9, 27.4, 2.6, ["protein", "carb", "main", "legume", "vegan"], 1, "usda_sr", 7.6),
  F("kidney_beans", "لوبیا قرمز پخته", "Kidney beans, boiled", "legume", "cooked", 150, "۱ پیمانه کوچک (۱۵۰ گرم)", 127, 8.7, 22.8, 0.5, ["protein", "carb", "main", "legume", "vegan"], 1, "usda_sr", 6.4),
  F("mung_beans", "ماش پخته", "Mung beans, boiled", "legume", "cooked", 150, "۱ پیمانه کوچک (۱۵۰ گرم)", 105, 7, 19.2, 0.4, ["protein", "carb", "main", "legume", "vegan"], 1, "usda_sr", 7.6),
  F("tofu", "توفو سفت", "Tofu, firm", "protein", "na", 100, "۱۰۰ گرم", 144, 17.3, 2.8, 8.7, ["protein", "main", "soy", "vegan"], 2, "usda_sr", 2.3),
  F("soy_chunks", "سویای خشک (پروتئین بافت‌دار)", "Textured soy protein, dry", "protein", "raw", 30, "۳۰ گرم خشک", 345, 52, 30, 1.2, ["protein", "main", "soy", "vegan"], 1, "label", 13),
  F("hummus", "حمص", "Hummus", "legume", "prepared", 60, "۴ قاشق غذاخوری (۶۰ گرم)", 166, 7.9, 14.3, 9.6, ["snack", "legume", "vegan", "fat"], 2, "usda_sr", 6),
  F("whey", "پروتئین وی (پودر)", "Whey protein powder", "supplement", "na", 30, "۱ اسکوپ (۳۰ گرم)", 400, 80, 8, 6, ["protein", "snack", "supplement", "lactose", "animal"], 3, "label", 0),
  // ---- grains / carbs
  F("rice_white", "برنج سفید پخته (کته/پلو بدون روغن)", "Rice, white, long-grain, cooked", "grain", "cooked", 150, "۱ کفگیر (۱۵۰ گرم)", 130, 2.7, 28.2, 0.3, ["carb", "main", "rice"], 2, "usda_sr", 0.4),
  F("rice_brown", "برنج قهوه‌ای پخته", "Rice, brown, long-grain, cooked", "grain", "cooked", 150, "۱ کفگیر (۱۵۰ گرم)", 123, 2.7, 25.6, 1, ["carb", "main", "rice", "vegan"], 3, "usda_sr", 1.6),
  F("pasta", "ماکارونی پخته", "Pasta, cooked, enriched", "grain", "cooked", 150, "۱ بشقاب کوچک (۱۵۰ گرم)", 158, 5.8, 30.9, 0.9, ["carb", "main", "gluten", "vegan"], 1, "usda_sr", 1.8),
  F("oats", "جو دوسر پرک (خشک)", "Oats, rolled, dry", "grain", "raw", 40, "نصف لیوان (۴۰ گرم)", 379, 13.2, 67.7, 6.5, ["carb", "breakfast", "gluten", "vegan"], 2, "usda_sr", 10.1),
  F("bread_whole", "نان سبوس‌دار/سنگک", "Whole-wheat flatbread (sangak-style)", "grain", "na", 60, "یک‌چهارم نان (۶۰ گرم)", 255, 10, 48, 2.5, ["carb", "breakfast", "bread", "gluten", "vegan"], 1, "estimate", 6),
  F("bread_lavash", "نان لواش", "Lavash flatbread", "grain", "na", 40, "۱ ورق (۴۰ گرم)", 275, 9, 55, 1.5, ["carb", "breakfast", "bread", "gluten", "vegan"], 1, "estimate", 2.5),
  F("bread_barbari", "نان بربری", "Barbari bread", "grain", "na", 70, "یک‌چهارم نان (۷۰ گرم)", 270, 8.5, 52, 3, ["carb", "breakfast", "bread", "gluten", "vegan"], 1, "estimate", 2.5),
  F("barley", "جو پرک پخته", "Barley, pearled, cooked", "grain", "cooked", 150, "۱ پیمانه کوچک (۱۵۰ گرم)", 123, 2.3, 28.2, 0.4, ["carb", "main", "gluten", "vegan"], 1, "usda_sr", 3.8),
  F("bulgur", "بلغور گندم پخته", "Bulgur, cooked", "grain", "cooked", 150, "۱ پیمانه کوچک (۱۵۰ گرم)", 83, 3.1, 18.6, 0.2, ["carb", "main", "gluten", "vegan"], 1, "usda_sr", 4.5),
  F("quinoa", "کینوا پخته", "Quinoa, cooked", "grain", "cooked", 150, "۱ پیمانه کوچک (۱۵۰ گرم)", 120, 4.4, 21.3, 1.9, ["carb", "main", "vegan"], 3, "usda_sr", 2.8),
  F("potato", "سیب‌زمینی آب‌پز", "Potato, boiled, without skin", "veg_starch", "cooked", 150, "۱ عدد متوسط (۱۵۰ گرم)", 86, 1.7, 20, 0.1, ["carb", "main", "vegan"], 1, "usda_sr", 2),
  F("sweet_potato", "سیب‌زمینی شیرین پخته", "Sweet potato, baked", "veg_starch", "cooked", 150, "۱ عدد متوسط (۱۵۰ گرم)", 90, 2, 20.7, 0.2, ["carb", "main", "vegan"], 2, "usda_sr", 3.3),
  // ---- fruits
  F("banana", "موز", "Banana, raw", "fruit", "raw", 120, "۱ عدد متوسط (۱۲۰ گرم)", 89, 1.1, 22.8, 0.3, ["fruit", "snack", "breakfast", "carb", "vegan"], 2, "usda_sr", 2.6),
  F("apple", "سیب", "Apple, raw, with skin", "fruit", "raw", 180, "۱ عدد متوسط (۱۸۰ گرم)", 52, 0.3, 13.8, 0.2, ["fruit", "snack", "vegan"], 1, "usda_sr", 2.4),
  F("orange", "پرتقال", "Orange, raw", "fruit", "raw", 150, "۱ عدد متوسط (۱۵۰ گرم)", 47, 0.9, 11.8, 0.1, ["fruit", "snack", "vegan"], 1, "usda_sr", 2.4),
  F("grapes", "انگور", "Grapes, raw", "fruit", "raw", 150, "۱ خوشه کوچک (۱۵۰ گرم)", 69, 0.7, 18.1, 0.2, ["fruit", "snack", "vegan"], 2, "usda_sr", 0.9),
  F("watermelon", "هندوانه", "Watermelon, raw", "fruit", "raw", 300, "۱ قاچ (۳۰۰ گرم)", 30, 0.6, 7.6, 0.2, ["fruit", "snack", "vegan"], 1, "usda_sr", 0.4),
  F("dates", "خرما", "Dates, Medjool", "fruit", "na", 24, "۱ عدد (۲۴ گرم)", 277, 1.8, 75, 0.2, ["fruit", "snack", "breakfast", "carb", "vegan"], 2, "usda_sr", 6.7),
  F("raisins", "کشمش", "Raisins, seedless", "fruit", "na", 30, "۲ قاشق غذاخوری (۳۰ گرم)", 299, 3.1, 79.2, 0.5, ["fruit", "snack", "vegan"], 2, "usda_sr", 3.7),
  // ---- vegetables
  F("cucumber", "خیار", "Cucumber, with peel, raw", "vegetable", "raw", 150, "۱ عدد (۱۵۰ گرم)", 15, 0.7, 3.6, 0.1, ["veg", "snack", "vegan"], 1, "usda_sr", 0.5),
  F("tomato", "گوجه‌فرنگی", "Tomato, raw", "vegetable", "raw", 120, "۱ عدد (۱۲۰ گرم)", 18, 0.9, 3.9, 0.2, ["veg", "vegan"], 1, "usda_sr", 1.2),
  F("lettuce", "کاهو", "Lettuce, green leaf, raw", "vegetable", "raw", 80, "۲ برگ بزرگ (۸۰ گرم)", 15, 1.4, 2.9, 0.2, ["veg", "vegan"], 1, "usda_sr", 1.3),
  F("spinach", "اسفناج", "Spinach, raw", "vegetable", "raw", 60, "۲ مشت (۶۰ گرم)", 23, 2.9, 3.6, 0.4, ["veg", "vegan"], 1, "usda_sr", 2.2),
  F("broccoli", "بروکلی پخته", "Broccoli, boiled", "vegetable", "cooked", 150, "۱ پیمانه (۱۵۰ گرم)", 35, 2.4, 7.2, 0.4, ["veg", "vegan"], 2, "usda_sr", 3.3),
  F("carrot", "هویج", "Carrot, raw", "vegetable", "raw", 80, "۱ عدد (۸۰ گرم)", 41, 0.9, 9.6, 0.2, ["veg", "snack", "vegan"], 1, "usda_sr", 2.8),
  F("bell_pepper", "فلفل دلمه‌ای", "Bell pepper, red, raw", "vegetable", "raw", 120, "۱ عدد (۱۲۰ گرم)", 31, 1, 6, 0.3, ["veg", "vegan"], 2, "usda_sr", 2.1),
  F("onion", "پیاز", "Onion, raw", "vegetable", "raw", 50, "نصف عدد (۵۰ گرم)", 40, 1.1, 9.3, 0.1, ["veg", "vegan"], 1, "usda_sr", 1.7),
  F("herbs", "سبزی خوردن", "Mixed fresh herbs", "vegetable", "raw", 50, "۱ مشت (۵۰ گرم)", 30, 2.5, 5, 0.5, ["veg", "vegan"], 1, "estimate", 2.5),
  F("shirazi_salad", "سالاد شیرازی", "Shirazi salad (cucumber, tomato, onion, lemon)", "vegetable", "prepared", 150, "۱ کاسه (۱۵۰ گرم)", 25, 0.9, 5, 0.2, ["veg", "main_side", "vegan"], 1, "estimate", 1.2),
  // ---- fats / nuts
  F("almonds", "بادام", "Almonds, raw", "nuts", "raw", 20, "۱۵ عدد (۲۰ گرم)", 579, 21.2, 21.6, 49.9, ["fat", "snack", "nuts", "vegan"], 3, "usda_sr", 12.5),
  F("walnuts", "گردو", "Walnuts, English", "nuts", "raw", 15, "۳ مغز کامل (۱۵ گرم)", 654, 15.2, 13.7, 65.2, ["fat", "snack", "breakfast", "nuts", "vegan"], 3, "usda_sr", 6.7),
  F("pistachios", "پسته", "Pistachios, dry roasted", "nuts", "na", 20, "۲۵ عدد (۲۰ گرم)", 572, 21, 28, 45.8, ["fat", "snack", "nuts", "vegan"], 3, "usda_sr", 10.3),
  F("peanuts", "بادام‌زمینی", "Peanuts, raw", "nuts", "raw", 20, "۱ مشت کوچک (۲۰ گرم)", 567, 25.8, 16.1, 49.2, ["fat", "snack", "nuts", "vegan"], 1, "usda_sr", 8.5),
  F("peanut_butter", "کره بادام‌زمینی", "Peanut butter, smooth", "nuts", "na", 16, "۱ قاشق غذاخوری (۱۶ گرم)", 588, 25, 20, 50, ["fat", "breakfast", "snack", "nuts", "vegan"], 2, "usda_sr", 6),
  F("tahini", "ارده", "Tahini (sesame paste)", "nuts", "na", 15, "۱ قاشق غذاخوری (۱۵ گرم)", 595, 17, 21.2, 53.8, ["fat", "breakfast", "vegan"], 2, "usda_sr", 9.3),
  F("olive_oil", "روغن زیتون", "Olive oil", "fat", "na", 10, "۲ قاشق چای‌خوری (۱۰ گرم)", 884, 0, 0, 100, ["fat", "cooking", "vegan"], 2, "usda_sr", 0),
  F("butter", "کره", "Butter, salted", "fat", "na", 10, "۱ قالب کوچک (۱۰ گرم)", 717, 0.9, 0.1, 81, ["fat", "breakfast", "lactose", "animal"], 2, "usda_sr", 0),
  F("avocado", "آووکادو", "Avocado, raw", "fruit", "raw", 70, "نصف عدد (۷۰ گرم)", 160, 2, 8.5, 14.7, ["fat", "breakfast", "vegan"], 3, "usda_sr", 6.7),
  F("dark_chocolate", "شکلات تلخ ۷۰٪+", "Dark chocolate 70–85% cacao", "treat", "na", 20, "۲ مربع (۲۰ گرم)", 598, 7.8, 45.9, 42.6, ["treat", "snack", "vegan"], 2, "usda_sr", 10.9),
  F("honey", "عسل", "Honey", "sweet", "na", 20, "۱ قاشق غذاخوری (۲۰ گرم)", 304, 0.3, 82.4, 0, ["carb", "breakfast", "treat"], 2, "usda_sr", 0.2),
  // ---- Iranian prepared dishes (estimates; components NOT double counted with rice)
  F("joojeh_kabab", "جوجه‌کباب", "Joojeh kabab (grilled chicken)", "prepared", "prepared", 200, "۱ سیخ (۲۰۰ گرم)", 160, 25, 2, 6, ["protein", "main", "meat", "animal", "iranian"], 2, "estimate", 0),
  F("koobideh", "کباب کوبیده", "Kabab koobideh", "prepared", "prepared", 110, "۱ سیخ (۱۱۰ گرم)", 260, 18, 4, 19, ["protein", "main", "meat", "red_meat", "animal", "iranian"], 3, "estimate", 0.5),
  F("ghormeh_sabzi", "خورش قورمه‌سبزی", "Ghormeh sabzi stew", "prepared", "prepared", 250, "۱ کاسه (۲۵۰ گرم)", 125, 8, 7, 7.5, ["main", "protein", "meat", "red_meat", "animal", "iranian", "stew"], 2, "estimate", 3),
  F("gheymeh", "خورش قیمه", "Gheymeh stew", "prepared", "prepared", 250, "۱ کاسه (۲۵۰ گرم)", 140, 8, 10, 7.5, ["main", "protein", "meat", "red_meat", "animal", "iranian", "stew"], 2, "estimate", 2.5),
  F("ash_reshteh", "آش رشته", "Ash reshteh", "prepared", "prepared", 300, "۱ کاسه (۳۰۰ گرم)", 95, 4, 14, 2.5, ["main", "carb", "legume", "gluten", "iranian", "lactose"], 1, "estimate", 3),
  F("kuku_sabzi", "کوکو سبزی", "Kuku sabzi (herb frittata)", "prepared", "prepared", 120, "۱ تکه (۱۲۰ گرم)", 185, 8, 6, 14.5, ["main", "egg", "animal", "iranian"], 1, "estimate", 2),
  F("adas_polo", "عدس‌پلو (بدون گوشت)", "Adas polo (rice with lentils)", "prepared", "prepared", 200, "۱ کفگیر بزرگ (۲۰۰ گرم)", 150, 5, 28, 2, ["carb", "main", "rice", "legume", "vegan", "iranian"], 1, "estimate", 3),
  F("mast_khiar", "ماست و خیار", "Mast-o-khiar (yogurt & cucumber)", "prepared", "prepared", 150, "۱ کاسه کوچک (۱۵۰ گرم)", 55, 4, 5.5, 1.8, ["dairy", "snack", "main_side", "lactose", "animal", "iranian"], 1, "estimate", 0.4),
  F("lentil_soup", "عدسی", "Adasi (lentil soup)", "prepared", "prepared", 250, "۱ کاسه (۲۵۰ گرم)", 100, 6.5, 16, 1.2, ["breakfast", "main", "legume", "vegan", "iranian"], 1, "estimate", 4),
  F("tea_unsweetened", "چای بدون قند", "Tea, brewed, unsweetened", "drink", "na", 250, "۱ لیوان", 1, 0, 0.3, 0, ["drink", "vegan"], 1, "usda_sr", 0),
];
