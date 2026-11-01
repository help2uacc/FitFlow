/**
 * Onboarding question bank. Each question writes to one profile field
 * (`field` = "<section>.<key>"). Questions are shown one per screen and may be
 * conditional on earlier answers. The bank is shared by client & server so the
 * server can validate every answer against the declared type/options.
 */
export type QuestionType =
  | "single" | "multi" | "number" | "slider" | "date" | "time" | "text" | "yesno" | "rank" | "photo";

export interface Option { value: string; label: string; hint?: string }
export type Answers = Record<string, unknown>;

export interface Question {
  id: string;
  category: CategoryId;
  field: string;
  type: QuestionType;
  title: string;
  help?: string;
  options?: Option[];
  recommended?: string;
  min?: number; max?: number; step?: number; unit?: string;
  optional?: boolean;
  maxSelect?: number;
  /** Exclusive option in multi-select (e.g. "none"). */
  exclusive?: string;
  when?: (a: Answers) => boolean;
  /** Changing this field after onboarding may require a plan update. */
  affects?: ("workout" | "nutrition")[];
}

export type CategoryId =
  | "personal" | "goals" | "experience" | "health" | "availability" | "lifestyle" | "preferences" | "nutrition_choice" | "nutrition";

export const CATEGORIES: Record<CategoryId, string> = {
  personal: "اطلاعات شخصی و بدنی",
  goals: "اهداف",
  experience: "سابقه ورزشی",
  health: "سلامت و محدودیت‌ها",
  availability: "زمان و امکانات تمرین",
  lifestyle: "سبک زندگی",
  preferences: "ترجیحات تمرینی",
  nutrition_choice: "برنامه غذایی",
  nutrition: "تغذیه",
};

const has = (a: Answers, id: string, v: string) => {
  const x = a[id];
  return Array.isArray(x) ? x.includes(v) : x === v;
};
const wantsFullNutrition = (a: Answers) => a["nutrition_mode"] === "full" || a["nutrition_mode"] === "recommend";

const BODY_AREAS: Option[] = [
  { value: "chest", label: "سینه" }, { value: "back", label: "پشت" }, { value: "shoulders", label: "سرشانه" },
  { value: "arms", label: "بازوها" }, { value: "abs", label: "شکم و میان‌تنه" }, { value: "glutes", label: "باسن" },
  { value: "legs", label: "پاها" }, { value: "calves", label: "ساق پا" },
];
const JOINTS: Option[] = [
  { value: "none", label: "هیچ‌کدام" }, { value: "shoulder", label: "شانه" }, { value: "knee", label: "زانو" },
  { value: "lower_back", label: "کمر" }, { value: "wrist", label: "مچ دست" }, { value: "elbow", label: "آرنج" },
  { value: "hip", label: "لگن/مفصل ران" }, { value: "neck", label: "گردن" }, { value: "ankle", label: "مچ پا" },
];
const WEEKDAYS: Option[] = [
  { value: "6", label: "شنبه" }, { value: "0", label: "یکشنبه" }, { value: "1", label: "دوشنبه" },
  { value: "2", label: "سه‌شنبه" }, { value: "3", label: "چهارشنبه" }, { value: "4", label: "پنجشنبه" }, { value: "5", label: "جمعه" },
];

export const QUESTIONS: Question[] = [
  // ---------------- A. personal & body
  { id: "birth_year", category: "personal", field: "personal.birthYear", type: "number", title: "سال تولد شما (میلادی یا شمسی)؟", help: "برای محاسبه نیاز انرژی و تنظیم شدت تمرین استفاده می‌شود.", min: 1300, max: 2015, affects: ["nutrition"] },
  { id: "sex", category: "personal", field: "personal.sex", type: "single", title: "جنسیت فیزیولوژیک شما؟", help: "فقط برای فرمول‌های تخمین متابولیسم پایه استفاده می‌شود.", options: [{ value: "male", label: "مرد" }, { value: "female", label: "زن" }], affects: ["nutrition"] },
  { id: "height", category: "personal", field: "personal.heightCm", type: "slider", title: "قد شما؟", min: 130, max: 220, step: 1, unit: "سانتی‌متر", recommended: "170", affects: ["nutrition"] },
  { id: "weight", category: "personal", field: "personal.weightKg", type: "number", title: "وزن فعلی شما؟", min: 30, max: 300, step: 0.1, unit: "کیلوگرم", affects: ["nutrition", "workout"] },
  { id: "bodyfat_known", category: "personal", field: "personal.bodyFatKnown", type: "yesno", title: "درصد چربی بدنتان را می‌دانید؟", help: "اگر با دستگاه یا کالیپر اندازه گرفته‌اید." },
  { id: "bodyfat", category: "personal", field: "personal.bodyFatPct", type: "slider", title: "درصد چربی تخمینی بدن؟", help: "این عدد فقط تخمین است و دقیق در نظر گرفته نمی‌شود.", min: 5, max: 50, step: 1, unit: "٪", when: (a) => a["bodyfat_known"] === true },
  { id: "desired_shape", category: "personal", field: "personal.desiredShape", type: "single", title: "کدام فرم بدنی را بیشتر می‌خواهید؟", options: [
    { value: "lean_athletic", label: "ورزیده و کم‌چربی" }, { value: "muscular", label: "عضلانی و حجیم" }, { value: "toned", label: "سفت و خوش‌فرم" },
    { value: "strong", label: "قوی و کاربردی" }, { value: "healthy", label: "سالم و متعادل" },
  ] },
  { id: "improve_areas", category: "personal", field: "personal.improveAreas", type: "multi", title: "کدام نواحی را بیشتر می‌خواهید بهبود دهید؟", options: BODY_AREAS, optional: true, affects: ["workout"] },
  { id: "recent_weight_change", category: "personal", field: "personal.recentWeightChange", type: "single", title: "در ۳ ماه اخیر وزنتان چه تغییری کرده؟", options: [
    { value: "stable", label: "تقریباً ثابت" }, { value: "gained", label: "افزایش یافته" }, { value: "lost", label: "کاهش یافته" }, { value: "unknown", label: "نمی‌دانم" },
  ] },
  { id: "waist", category: "personal", field: "personal.waistCm", type: "number", title: "دور کمر (اختیاری)؟", help: "در سطح ناف، صبح و ناشتا اندازه بگیرید.", min: 40, max: 200, step: 0.5, unit: "سانتی‌متر", optional: true },
  { id: "photo", category: "personal", field: "personal.hasPhoto", type: "photo", title: "عکس شروع (اختیاری)", help: "عکس‌ها خصوصی‌اند، فقط برای مقایسه پیشرفت ذخیره می‌شوند و هر زمان قابل حذف هستند.", optional: true },

  // ---------------- B. goals
  { id: "primary_goal", category: "goals", field: "goals.primary", type: "single", title: "هدف اصلی شما چیست؟", options: [
    { value: "muscle_gain", label: "افزایش عضله" }, { value: "fat_loss", label: "کاهش چربی" }, { value: "recomp", label: "هم‌زمان: چربی کمتر، عضله بیشتر" },
    { value: "strength", label: "افزایش قدرت" }, { value: "endurance", label: "استقامت" }, { value: "general", label: "تناسب اندام عمومی" },
    { value: "mobility", label: "تحرک و انعطاف" }, { value: "maintain", label: "حفظ وزن سالم" },
  ], affects: ["workout", "nutrition"] },
  { id: "secondary_goals", category: "goals", field: "goals.secondary", type: "multi", title: "اهداف فرعی (اختیاری)؟", optional: true, maxSelect: 3, options: [
    { value: "muscle_gain", label: "عضله" }, { value: "fat_loss", label: "کاهش چربی" }, { value: "strength", label: "قدرت" },
    { value: "endurance", label: "استقامت" }, { value: "mobility", label: "تحرک" }, { value: "posture", label: "بهبود وضعیت بدنی" }, { value: "energy", label: "انرژی بیشتر" },
  ], affects: ["workout"] },
  { id: "goal_priority", category: "goals", field: "goals.priorityOrder", type: "rank", title: "اولویت اهداف را مرتب کنید", help: "مهم‌ترین را بالا بیاورید.", options: [
    { value: "aesthetics", label: "ظاهر" }, { value: "strength", label: "قدرت" }, { value: "health", label: "سلامت" }, { value: "performance", label: "عملکرد ورزشی" },
  ], optional: true },
  { id: "muscle_priorities", category: "goals", field: "goals.musclePriorities", type: "multi", title: "عضلات اولویت‌دار برای رشد؟", optional: true, maxSelect: 3, options: BODY_AREAS, when: (a) => ["muscle_gain", "recomp", "general"].includes(String(a["primary_goal"])), affects: ["workout"] },
  { id: "strength_lifts", category: "goals", field: "goals.strengthFocus", type: "multi", title: "در کدام حرکات می‌خواهید قوی‌تر شوید؟", optional: true, options: [
    { value: "squat", label: "اسکوات" }, { value: "bench", label: "پرس سینه" }, { value: "deadlift", label: "ددلیفت" }, { value: "ohp", label: "پرس سرشانه" }, { value: "pullup", label: "بارفیکس" },
  ], when: (a) => has(a, "primary_goal", "strength") || has(a, "secondary_goals", "strength"), affects: ["workout"] },
  { id: "endurance_goal", category: "goals", field: "goals.enduranceGoal", type: "single", title: "هدف استقامتی شما؟", options: [
    { value: "5k", label: "دویدن ۵ کیلومتر" }, { value: "10k", label: "دویدن ۱۰ کیلومتر" }, { value: "cardio_health", label: "سلامت قلبی-عروقی" }, { value: "stamina", label: "استقامت روزمره" },
  ], when: (a) => has(a, "primary_goal", "endurance") || has(a, "secondary_goals", "endurance") },
  { id: "target_weight", category: "goals", field: "goals.targetWeightKg", type: "number", title: "وزن هدف (اختیاری)؟", min: 35, max: 250, step: 0.5, unit: "کیلوگرم", optional: true, when: (a) => ["fat_loss", "muscle_gain", "recomp", "maintain"].includes(String(a["primary_goal"])), affects: ["nutrition"] },
  { id: "timeframe", category: "goals", field: "goals.timeframeWeeks", type: "single", title: "در چه بازه‌ای می‌خواهید به هدفتان نزدیک شوید؟", options: [
    { value: "8", label: "۲ ماه" }, { value: "12", label: "۳ ماه" }, { value: "24", label: "۶ ماه" }, { value: "52", label: "یک سال" }, { value: "0", label: "عجله‌ای ندارم" },
  ], recommended: "12" },
  { id: "physique_reference", category: "goals", field: "goals.reference", type: "text", title: "توضیح یا نمونه ظاهری که دوست دارید (اختیاری)", optional: true },

  // ---------------- C. experience
  { id: "experience", category: "experience", field: "experience.years", type: "single", title: "سابقه تمرین منظم شما؟", options: [
    { value: "0", label: "تازه شروع می‌کنم" }, { value: "0.5", label: "کمتر از ۶ ماه" }, { value: "1", label: "۶ ماه تا ۲ سال" }, { value: "3", label: "۲ تا ۵ سال" }, { value: "6", label: "بیش از ۵ سال" },
  ], affects: ["workout"] },
  { id: "activity_level", category: "experience", field: "experience.activityLevel", type: "single", title: "در حال حاضر چقدر فعال هستید؟", options: [
    { value: "sedentary", label: "کم‌تحرک" }, { value: "light", label: "کمی فعال (۱-۲ روز ورزش)" }, { value: "moderate", label: "فعال (۳-۴ روز)" }, { value: "high", label: "خیلی فعال (۵+ روز)" },
  ], affects: ["nutrition", "workout"] },
  { id: "previous_types", category: "experience", field: "experience.previousTypes", type: "multi", title: "چه نوع ورزش‌هایی انجام داده‌اید؟", optional: true, options: [
    { value: "gym", label: "بدنسازی" }, { value: "running", label: "دویدن" }, { value: "team", label: "ورزش تیمی" }, { value: "martial", label: "رزمی" },
    { value: "yoga", label: "یوگا/پیلاتس" }, { value: "swim", label: "شنا" }, { value: "crossfit", label: "کراس‌فیت/فانکشنال" }, { value: "home", label: "تمرین در خانه" },
  ] },
  { id: "level", category: "experience", field: "experience.level", type: "single", title: "سطح خودتان را چگونه ارزیابی می‌کنید؟", options: [
    { value: "beginner", label: "مبتدی" }, { value: "intermediate", label: "متوسط" }, { value: "advanced", label: "پیشرفته" },
  ], recommended: "beginner", affects: ["workout"] },
  { id: "resistance_familiarity", category: "experience", field: "experience.resistanceFamiliarity", type: "single", title: "با تکنیک حرکات وزنه آشنایی دارید؟", options: [
    { value: "none", label: "آشنایی ندارم" }, { value: "basic", label: "حرکات پایه را بلدم" }, { value: "good", label: "اکثر حرکات را درست اجرا می‌کنم" },
  ], affects: ["workout"] },
  { id: "pushups", category: "experience", field: "experience.maxPushups", type: "single", title: "چند شنا سوئدی کامل پشت سر هم می‌زنید؟", options: [
    { value: "0", label: "هیچ" }, { value: "5", label: "۱ تا ۵" }, { value: "15", label: "۶ تا ۱۵" }, { value: "30", label: "۱۶ تا ۳۰" }, { value: "40", label: "بیش از ۳۰" },
  ] },
  { id: "lifts_known", category: "experience", field: "experience.knowsLifts", type: "yesno", title: "رکورد وزنه حرکات اصلی را می‌دانید؟", optional: true, when: (a) => a["resistance_familiarity"] !== "none" },
  { id: "lift_bench", category: "experience", field: "experience.benchKg", type: "number", title: "بیشترین وزنه پرس سینه برای ۵ تکرار؟", unit: "کیلوگرم", min: 0, max: 400, optional: true, when: (a) => a["lifts_known"] === true },
  { id: "lift_squat", category: "experience", field: "experience.squatKg", type: "number", title: "بیشترین وزنه اسکوات برای ۵ تکرار؟", unit: "کیلوگرم", min: 0, max: 500, optional: true, when: (a) => a["lifts_known"] === true },
  { id: "lift_deadlift", category: "experience", field: "experience.deadliftKg", type: "number", title: "بیشترین وزنه ددلیفت برای ۵ تکرار؟", unit: "کیلوگرم", min: 0, max: 500, optional: true, when: (a) => a["lifts_known"] === true },
  { id: "successful_methods", category: "experience", field: "experience.successfulMethods", type: "text", title: "چه روش تمرینی قبلاً برایتان جواب داده؟ (اختیاری)", optional: true, when: (a) => a["experience"] !== "0" },
  { id: "disliked_exercises", category: "experience", field: "experience.dislikedExercises", type: "text", title: "حرکاتی که دوست ندارید یا نمی‌خواهید در برنامه باشد؟ (اختیاری)", optional: true, affects: ["workout"] },
  { id: "adherence_issues", category: "experience", field: "experience.adherenceIssues", type: "multi", title: "چه چیزی قبلاً باعث رها کردن تمرین شده؟", optional: true, options: [
    { value: "time", label: "کمبود وقت" }, { value: "boredom", label: "یکنواختی" }, { value: "no_results", label: "نتیجه نگرفتن" }, { value: "injury", label: "آسیب/درد" },
    { value: "motivation", label: "انگیزه" }, { value: "too_hard", label: "سختی زیاد برنامه" }, { value: "none", label: "مشکلی نداشتم" },
  ], exclusive: "none" },

  // ---------------- D. health
  { id: "red_flags", category: "health", field: "health.redFlags", type: "multi", title: "آیا هنگام فعالیت بدنی هیچ‌کدام از این‌ها را تجربه می‌کنید؟", help: "پاسخ صادقانه به ایمن بودن برنامه کمک می‌کند.", options: [
    { value: "none", label: "هیچ‌کدام" }, { value: "chest_pain", label: "درد یا فشار قفسه سینه" }, { value: "fainting", label: "سرگیجه شدید یا غش" },
    { value: "breathless", label: "تنگی نفس غیرعادی" }, { value: "palpitations", label: "تپش قلب نامنظم" },
  ], exclusive: "none", affects: ["workout"] },
  { id: "conditions", category: "health", field: "health.conditions", type: "multi", title: "شرایط سلامتی مرتبط با ورزش؟", options: [
    { value: "none", label: "ندارم" }, { value: "hypertension", label: "فشار خون بالا" }, { value: "diabetes", label: "دیابت" }, { value: "heart", label: "بیماری قلبی" },
    { value: "asthma", label: "آسم" }, { value: "pregnancy", label: "بارداری/پس از زایمان" }, { value: "other", label: "سایر" },
  ], exclusive: "none", affects: ["workout", "nutrition"] },
  { id: "injuries", category: "health", field: "health.injuries", type: "multi", title: "آسیب‌دیدگی قبلی در کدام ناحیه داشته‌اید؟", options: JOINTS, exclusive: "none", affects: ["workout"] },
  { id: "current_pain", category: "health", field: "health.currentPain", type: "multi", title: "در حال حاضر هنگام تمرین در کدام ناحیه درد دارید؟", options: JOINTS, exclusive: "none", affects: ["workout"] },
  { id: "surgeries", category: "health", field: "health.surgeries", type: "text", title: "جراحی مرتبط (اختیاری)؟", optional: true, when: (a) => Array.isArray(a["injuries"]) && !(a["injuries"] as string[]).includes("none") },
  { id: "movement_restrictions", category: "health", field: "health.restrictions", type: "text", title: "محدودیت حرکتی خاص یا توصیه پزشک (اختیاری)؟", optional: true, affects: ["workout"] },
  { id: "medications", category: "health", field: "health.medications", type: "text", title: "دارو یا مکمل مرتبط (اختیاری)؟", help: "مثلاً داروهای فشار خون که روی ضربان قلب اثر دارند.", optional: true },

  // ---------------- E. availability
  { id: "location", category: "availability", field: "training.location", type: "single", title: "کجا تمرین می‌کنید؟", options: [
    { value: "gym", label: "باشگاه کامل" }, { value: "home_equipped", label: "خانه با تجهیزات" }, { value: "home_minimal", label: "خانه بدون/با حداقل وسیله" }, { value: "outdoor", label: "فضای باز" },
  ], affects: ["workout"] },
  { id: "equipment", category: "availability", field: "equipment.items", type: "multi", title: "کدام تجهیزات در دسترس است؟", options: [
    { value: "barbell", label: "هالتر و صفحه" }, { value: "dumbbell", label: "دمبل" }, { value: "bench", label: "نیمکت" }, { value: "machine", label: "دستگاه‌ها" },
    { value: "cable", label: "سیم‌کش" }, { value: "pullup_bar", label: "میله بارفیکس" }, { value: "dip_bar", label: "پارالل/دیپ" }, { value: "kettlebell", label: "کتل‌بل" },
    { value: "bands", label: "کش مقاومتی" }, { value: "cardio_machine", label: "تردمیل/دوچرخه/الپتیکال" }, { value: "ezbar", label: "میله EZ" }, { value: "box", label: "سکو/جعبه" },
  ], affects: ["workout"], when: (a) => a["location"] !== "gym" },
  { id: "days_per_week", category: "availability", field: "training.daysPerWeek", type: "single", title: "چند روز در هفته می‌توانید تمرین کنید؟", options: [
    { value: "2", label: "۲ روز" }, { value: "3", label: "۳ روز" }, { value: "4", label: "۴ روز" }, { value: "5", label: "۵ روز" }, { value: "6", label: "۶ روز" },
  ], recommended: "3", affects: ["workout"] },
  { id: "preferred_days", category: "availability", field: "training.preferredDays", type: "multi", title: "کدام روزها برای تمرین مناسب‌ترند؟", options: WEEKDAYS, affects: ["workout"] },
  { id: "session_minutes", category: "availability", field: "training.sessionMinutes", type: "slider", title: "هر جلسه چند دقیقه وقت دارید؟", min: 20, max: 120, step: 5, unit: "دقیقه", recommended: "60", affects: ["workout"] },
  { id: "workout_time", category: "availability", field: "training.preferredTime", type: "single", title: "معمولاً چه ساعتی تمرین می‌کنید؟", options: [
    { value: "morning", label: "صبح" }, { value: "noon", label: "ظهر" }, { value: "afternoon", label: "عصر" }, { value: "evening", label: "شب" }, { value: "varies", label: "متغیر" },
  ], affects: ["nutrition"] },
  { id: "intensity_pref", category: "availability", field: "training.intensity", type: "single", title: "شدت تمرین دلخواه؟", options: [
    { value: "low", label: "سبک و قابل تحمل" }, { value: "moderate", label: "متوسط" }, { value: "high", label: "سنگین و چالشی" },
  ], recommended: "moderate", affects: ["workout"] },
  { id: "training_style", category: "availability", field: "training.style", type: "single", title: "سبک تمرین دلخواه؟", options: [
    { value: "classic", label: "بدنسازی کلاسیک" }, { value: "strength", label: "قدرتی" }, { value: "circuit", label: "دایره‌ای/پرتحرک" }, { value: "mixed", label: "ترکیبی" }, { value: "ai", label: "هوش مصنوعی پیشنهاد دهد" },
  ], recommended: "ai", affects: ["workout"] },
  { id: "cardio_prefs", category: "availability", field: "training.cardioPrefs", type: "multi", title: "کدام فعالیت‌های هوازی را دوست دارید؟", optional: true, options: [
    { value: "walking", label: "پیاده‌روی" }, { value: "running", label: "دویدن" }, { value: "cycling", label: "دوچرخه" }, { value: "rowing", label: "روئینگ" },
    { value: "elliptical", label: "الپتیکال" }, { value: "jump_rope", label: "طناب‌زنی" }, { value: "none", label: "هوازی نمی‌خواهم" },
  ], exclusive: "none", affects: ["workout"] },

  // ---------------- F. lifestyle
  { id: "occupation", category: "lifestyle", field: "lifestyle.occupation", type: "single", title: "نوع فعالیت شغلی شما؟", options: [
    { value: "desk", label: "پشت میز" }, { value: "standing", label: "ایستاده/راه رفتن" }, { value: "physical", label: "کار بدنی سنگین" }, { value: "mixed", label: "ترکیبی" },
  ], affects: ["nutrition"] },
  { id: "daily_steps", category: "lifestyle", field: "lifestyle.dailySteps", type: "single", title: "حدوداً روزی چند قدم راه می‌روید؟", options: [
    { value: "3000", label: "کمتر از ۴ هزار" }, { value: "6000", label: "۴ تا ۸ هزار" }, { value: "10000", label: "۸ تا ۱۲ هزار" }, { value: "14000", label: "بیش از ۱۲ هزار" }, { value: "unknown", label: "نمی‌دانم" },
  ], affects: ["nutrition"] },
  { id: "sleep_hours", category: "lifestyle", field: "lifestyle.sleepHours", type: "slider", title: "میانگین ساعت خواب شبانه؟", min: 3, max: 11, step: 0.5, unit: "ساعت", recommended: "7.5" },
  { id: "sleep_quality", category: "lifestyle", field: "lifestyle.sleepQuality", type: "single", title: "کیفیت خواب شما؟", options: [
    { value: "poor", label: "ضعیف" }, { value: "fair", label: "متوسط" }, { value: "good", label: "خوب" },
  ] },
  { id: "stress", category: "lifestyle", field: "lifestyle.stress", type: "single", title: "سطح استرس روزانه؟", options: [
    { value: "low", label: "کم" }, { value: "moderate", label: "متوسط" }, { value: "high", label: "زیاد" },
  ], affects: ["workout"] },
  { id: "food_habits", category: "lifestyle", field: "lifestyle.foodHabits", type: "single", title: "عادت غذایی کلی شما؟", options: [
    { value: "irregular", label: "نامنظم" }, { value: "home", label: "بیشتر غذای خانگی" }, { value: "outside", label: "زیاد بیرون غذا می‌خورم" }, { value: "structured", label: "منظم و برنامه‌دار" },
  ] },
  { id: "hydration", category: "lifestyle", field: "lifestyle.hydration", type: "single", title: "روزانه چقدر آب می‌نوشید؟", options: [
    { value: "low", label: "کمتر از ۱ لیتر" }, { value: "mid", label: "۱ تا ۲ لیتر" }, { value: "high", label: "بیش از ۲ لیتر" },
  ] },
  { id: "motivation", category: "lifestyle", field: "lifestyle.challenges", type: "multi", title: "بزرگ‌ترین چالش شما برای ثبات؟", optional: true, options: [
    { value: "time", label: "وقت" }, { value: "energy", label: "خستگی" }, { value: "motivation", label: "انگیزه" }, { value: "travel", label: "سفر" }, { value: "family", label: "مسئولیت‌های خانوادگی" }, { value: "none", label: "مشکلی ندارم" },
  ], exclusive: "none" },

  // ---------------- G. preferences
  { id: "split_pref", category: "preferences", field: "preferences.split", type: "single", title: "نوع تقسیم‌بندی تمرین؟", options: [
    { value: "full_body", label: "تمام بدن" }, { value: "upper_lower", label: "بالاتنه/پایین‌تنه" }, { value: "ppl", label: "پوش/پول/پا" }, { value: "body_part", label: "هر روز یک عضله" }, { value: "ai", label: "هوش مصنوعی انتخاب کند" },
  ], recommended: "ai", affects: ["workout"] },
  { id: "machines_vs_free", category: "preferences", field: "preferences.machinesVsFree", type: "single", title: "دستگاه یا وزنه آزاد؟", options: [
    { value: "machines", label: "بیشتر دستگاه" }, { value: "free", label: "بیشتر وزنه آزاد" }, { value: "mixed", label: "ترکیبی" },
  ], recommended: "mixed", when: (a) => a["location"] === "gym", affects: ["workout"] },
  { id: "difficulty_pref", category: "preferences", field: "preferences.difficulty", type: "slider", title: "سختی برنامه از ۱ تا ۵؟", min: 1, max: 5, step: 1, recommended: "3", affects: ["workout"] },
  { id: "tracking_pref", category: "preferences", field: "preferences.tracking", type: "single", title: "چقدر جزئیات ثبت کنید؟", options: [
    { value: "minimal", label: "حداقل (فقط انجام شد/نشد)" }, { value: "standard", label: "وزنه و تکرار" }, { value: "detailed", label: "با RPE/RIR و یادداشت" },
  ], recommended: "standard" },
  { id: "review_frequency", category: "preferences", field: "preferences.cycleWeeks", type: "single", title: "هر چند هفته برنامه بازبینی شود؟", options: [
    { value: "4", label: "۴ هفته" }, { value: "5", label: "۵ هفته" }, { value: "6", label: "۶ هفته" },
  ], recommended: "4" },

  // ---------------- nutrition choice
  { id: "nutrition_mode", category: "nutrition_choice", field: "nutrition.mode", type: "single", title: "برنامه غذایی هم می‌خواهید؟", options: [
    { value: "none", label: "فقط برنامه تمرینی" }, { value: "full", label: "برنامه تمرینی + برنامه غذایی کامل" },
    { value: "guidance", label: "برنامه تمرینی + راهنمای کلی تغذیه" }, { value: "recommend", label: "بهترین گزینه را پیشنهاد بده" },
  ], affects: ["nutrition"] },

  // ---------------- nutrition details (only when full plan requested)
  { id: "nutrition_goal", category: "nutrition", field: "nutrition.goal", type: "single", title: "هدف تغذیه‌ای؟", options: [
    { value: "auto", label: "مطابق هدف تمرینی" }, { value: "lose", label: "کاهش وزن" }, { value: "gain", label: "افزایش وزن" }, { value: "maintain", label: "حفظ وزن" }, { value: "performance", label: "عملکرد بهتر" },
  ], recommended: "auto", when: wantsFullNutrition, affects: ["nutrition"] },
  { id: "meals_per_day", category: "nutrition", field: "nutrition.mealsPerDay", type: "single", title: "چند وعده در روز ترجیح می‌دهید؟", options: [
    { value: "2", label: "۲ وعده" }, { value: "3", label: "۳ وعده" }, { value: "4", label: "۳ وعده + ۱ میان‌وعده" }, { value: "5", label: "۳ وعده + ۲ میان‌وعده" },
  ], recommended: "4", when: wantsFullNutrition, affects: ["nutrition"] },
  { id: "wake_time", category: "nutrition", field: "nutrition.wakeTime", type: "time", title: "معمولاً چه ساعتی بیدار می‌شوید؟", when: wantsFullNutrition },
  { id: "bed_time", category: "nutrition", field: "nutrition.bedTime", type: "time", title: "معمولاً چه ساعتی می‌خوابید؟", when: wantsFullNutrition },
  { id: "appetite", category: "nutrition", field: "nutrition.appetite", type: "single", title: "اشتهای شما معمولاً چطور است؟", options: [
    { value: "low", label: "کم" }, { value: "normal", label: "معمولی" }, { value: "high", label: "زیاد" }, { value: "evening", label: "شب‌ها زیاد" },
  ], when: wantsFullNutrition },
  { id: "favorite_foods", category: "nutrition", field: "nutrition.favorites", type: "multi", title: "غذاهای مورد علاقه؟", optional: true, options: [
    { value: "rice", label: "برنج" }, { value: "chicken", label: "مرغ" }, { value: "red_meat", label: "گوشت قرمز" }, { value: "fish", label: "ماهی" }, { value: "eggs", label: "تخم‌مرغ" },
    { value: "dairy", label: "لبنیات" }, { value: "legumes", label: "حبوبات" }, { value: "bread", label: "نان" }, { value: "stews", label: "خورش‌ها" }, { value: "fruit", label: "میوه" }, { value: "nuts", label: "آجیل" },
  ], when: wantsFullNutrition, affects: ["nutrition"] },
  { id: "disliked_foods", category: "nutrition", field: "nutrition.dislikes", type: "text", title: "غذاهایی که دوست ندارید؟ (اختیاری)", optional: true, when: wantsFullNutrition, affects: ["nutrition"] },
  { id: "allergies", category: "nutrition", field: "nutrition.allergies", type: "multi", title: "حساسیت یا عدم تحمل غذایی؟", options: [
    { value: "none", label: "ندارم" }, { value: "lactose", label: "لاکتوز" }, { value: "gluten", label: "گلوتن" }, { value: "nuts", label: "آجیل" }, { value: "eggs", label: "تخم‌مرغ" }, { value: "seafood", label: "غذای دریایی" }, { value: "soy", label: "سویا" },
  ], exclusive: "none", when: wantsFullNutrition, affects: ["nutrition"] },
  { id: "diet_restrictions", category: "nutrition", field: "nutrition.restrictions", type: "multi", title: "محدودیت رژیمی؟", options: [
    { value: "none", label: "ندارم" }, { value: "vegetarian", label: "گیاه‌خوار" }, { value: "vegan", label: "وگان" }, { value: "halal", label: "حلال" }, { value: "low_carb", label: "کم‌کربوهیدرات" }, { value: "no_red_meat", label: "بدون گوشت قرمز" },
  ], exclusive: "none", when: wantsFullNutrition, affects: ["nutrition"] },
  { id: "cuisine", category: "nutrition", field: "nutrition.cuisine", type: "single", title: "آشپزی ترجیحی؟", options: [
    { value: "iranian", label: "ایرانی" }, { value: "mixed", label: "ترکیبی ایرانی و بین‌المللی" }, { value: "international", label: "بین‌المللی" },
  ], recommended: "iranian", when: wantsFullNutrition },
  { id: "region", category: "nutrition", field: "nutrition.region", type: "single", title: "در کدام کشور زندگی می‌کنید؟ (برای در دسترس بودن مواد)", options: [
    { value: "IR", label: "ایران" }, { value: "other", label: "کشور دیگر" },
  ], when: wantsFullNutrition },
  { id: "budget", category: "nutrition", field: "nutrition.budget", type: "single", title: "بودجه غذایی؟", options: [
    { value: "low", label: "اقتصادی" }, { value: "medium", label: "متوسط" }, { value: "high", label: "بدون محدودیت" },
  ], recommended: "medium", when: wantsFullNutrition, affects: ["nutrition"] },
  { id: "cooking_time", category: "nutrition", field: "nutrition.cookingMinutes", type: "single", title: "روزانه چقدر وقت آشپزی دارید؟", options: [
    { value: "10", label: "کمتر از ۱۵ دقیقه" }, { value: "30", label: "حدود ۳۰ دقیقه" }, { value: "60", label: "یک ساعت یا بیشتر" },
  ], when: wantsFullNutrition, affects: ["nutrition"] },
  { id: "meal_prep", category: "nutrition", field: "nutrition.mealPrep", type: "yesno", title: "آماده‌سازی غذا برای چند روز (Meal Prep) را دوست دارید؟", when: wantsFullNutrition },
  { id: "eat_out", category: "nutrition", field: "nutrition.eatOut", type: "single", title: "چند بار در هفته بیرون غذا می‌خورید؟", options: [
    { value: "0", label: "تقریباً هرگز" }, { value: "2", label: "۱-۲ بار" }, { value: "4", label: "۳-۵ بار" }, { value: "7", label: "بیشتر" },
  ], when: wantsFullNutrition },
  { id: "fast_food", category: "nutrition", field: "nutrition.fastFood", type: "single", title: "مصرف فست‌فود؟", options: [
    { value: "rare", label: "به‌ندرت" }, { value: "weekly", label: "هفتگی" }, { value: "often", label: "زیاد" },
  ], when: wantsFullNutrition },
  { id: "sweets", category: "nutrition", field: "nutrition.sweets", type: "single", title: "مصرف شیرینی و نوشابه؟", options: [
    { value: "rare", label: "کم" }, { value: "moderate", label: "متوسط" }, { value: "high", label: "زیاد" },
  ], when: wantsFullNutrition },
  { id: "night_eating", category: "nutrition", field: "nutrition.nightEating", type: "yesno", title: "آخر شب گرسنه می‌شوید یا غذا می‌خورید؟", when: wantsFullNutrition },
  { id: "supplements", category: "nutrition", field: "nutrition.supplements", type: "multi", title: "مکمل‌های فعلی؟", optional: true, options: [
    { value: "none", label: "ندارم" }, { value: "whey", label: "پروتئین وی" }, { value: "creatine", label: "کراتین" }, { value: "multivitamin", label: "مولتی‌ویتامین" }, { value: "vitamin_d", label: "ویتامین D" }, { value: "omega3", label: "امگا ۳" },
  ], exclusive: "none", when: wantsFullNutrition, affects: ["nutrition"] },
  { id: "digestive", category: "nutrition", field: "nutrition.digestive", type: "multi", title: "مشکل گوارشی مرتبط؟", optional: true, options: [
    { value: "none", label: "ندارم" }, { value: "bloating", label: "نفخ" }, { value: "reflux", label: "ریفلاکس" }, { value: "ibs", label: "روده تحریک‌پذیر" },
  ], exclusive: "none", when: wantsFullNutrition, affects: ["nutrition"] },
  { id: "measurement_pref", category: "nutrition", field: "nutrition.measurement", type: "single", title: "مقدار غذا را چطور اندازه بگیریم؟", options: [
    { value: "grams", label: "گرم (ترازو)" }, { value: "household", label: "پیمانه خانگی (قاشق، لیوان، کف دست)" },
  ], recommended: "household", when: wantsFullNutrition },
  { id: "flexibility", category: "nutrition", field: "nutrition.flexibility", type: "single", title: "چقدر انعطاف در برنامه غذایی می‌خواهید؟", options: [
    { value: "strict", label: "دقیق و منظم" }, { value: "balanced", label: "متعادل (۸۰/۲۰)" }, { value: "flexible", label: "خیلی منعطف" },
  ], recommended: "balanced", when: wantsFullNutrition },
  { id: "treats", category: "nutrition", field: "nutrition.treats", type: "text", title: "خوراکی دلخواه که می‌خواهید گاهی در برنامه باشد؟ (اختیاری)", optional: true, when: wantsFullNutrition },
];

export const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

export function isVisible(q: Question, answers: Answers) {
  return !q.when || q.when(answers);
}

/** Ordered list of currently applicable questions given answers so far. */
export function visibleQuestions(answers: Answers) {
  return QUESTIONS.filter((q) => isVisible(q, answers));
}

export function isAnswered(q: Question, answers: Answers) {
  const v = answers[q.id];
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0 || !!q.optional;
  if (typeof v === "string") return v.trim().length > 0 || !!q.optional;
  return true;
}

/** First visible question that has not been answered (or skipped). */
export function nextUnanswered(answers: Answers): Question | null {
  return visibleQuestions(answers).find((q) => !(q.id in answers)) ?? null;
}
