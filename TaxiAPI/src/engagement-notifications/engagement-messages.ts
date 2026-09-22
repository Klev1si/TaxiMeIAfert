import { EngagementNotificationType as T } from '../entities/index.js';

/**
 * Message pools for automatic engagement pushes. One variant is picked at
 * random per send, never the same one the user got last time for that type.
 *
 * Placeholders ({name}, {rides}, {amount}, {online}, {total}) are filled by
 * EngagementNotificationsService.render(). `key` is stored in the ledger —
 * keep keys stable when editing texts; append new variants freely.
 */
export interface EngagementMessage {
  key:   string;
  title: string;
  body:  string;
}

export const ENGAGEMENT_MESSAGES: Record<T, EngagementMessage[]> = {
  // ── Drivers (solo + company) ─────────────────────────────────────────────
  [T.DRIVER_MORNING]: [
    { key: 'dm_start_profit', title: 'Mirëmëngjes, {name}! ☀️',
      body: 'Është koha të hysh në aplikacion dhe t’ia nisësh ditës me fitime.' },
    { key: 'dm_clients_waiting', title: 'Klientët po të presin 🚕',
      body: 'Kërkesat e para të ditës po vijnë. Kalo online dhe merr udhëtimin e parë.' },
    { key: 'dm_early_bird', title: 'Kush zgjohet herët, fiton më shumë',
      body: 'Orët e mëngjesit janë nga më të ngarkuarat. Hyr online tani, {name}!' },
    { key: 'dm_new_day', title: 'Ditë e re, fitime të reja 💶',
      body: 'Kalo online dhe bëje sot ditën tënde më të mirë.' },
    { key: 'dm_coffee', title: 'Kafeja gati? ☕',
      body: 'Atëherë edhe ti je gati. Hap aplikacionin dhe fillo të pranosh udhëtime.' },
    { key: 'dm_rush', title: 'Qyteti po lëviz 🏙️',
      body: 'Njerëzit po nisen për në punë e shkollë. Ji online dhe kap kërkesat e para.' },
    { key: 'dm_goal', title: 'Cili është objektivi yt sot?',
      body: 'Çdo udhëtim të afron më shumë. Hyr në aplikacion dhe nise ditën fort, {name}.' },
  ],

  [T.DRIVER_EVENING_PEAK]: [
    { key: 'de_peak', title: 'Orari i pikut po fillon 🔥',
      body: 'Mbrëmja është koha me më shumë kërkesa. Kalo online dhe mos humb fitime.' },
    { key: 'de_home', title: 'Njerëzit po kthehen në shtëpi',
      body: 'Shumë klientë kërkojnë taksi tani. Hyr online, {name}!' },
    { key: 'de_extra', title: 'Pak orë, fitim shtesë 💶',
      body: 'Disa udhëtime në mbrëmje e bëjnë ditën ndryshe. Aplikacioni të pret.' },
    { key: 'de_not_today', title: 'Sot nuk të kemi parë online',
      body: 'Ende ka kohë për të fituar sot. Kalo online për orët e mbrëmjes.' },
  ],

  [T.DRIVER_WINBACK]: [
    { key: 'dw_miss_you', title: 'Na ke munguar, {name}! 👋',
      body: 'Klientët po kërkojnë shoferë në zonën tënde. Hyr në aplikacion dhe rifillo të fitosh.' },
    { key: 'dw_requests', title: 'Kërkesat vazhdojnë të vijnë',
      body: 'Ndërkohë që ti mungon, udhëtimet po i marrin të tjerët. Kthehu online sot.' },
    { key: 'dw_easy', title: 'Rikthimi është i thjeshtë',
      body: 'Vetëm një prekje: hap aplikacionin dhe kalo online. Ne kujdesemi për klientët.' },
    { key: 'dw_week', title: 'Nisja e një jave të mirë',
      body: 'Kalo online këtë javë dhe shiko sa shpejt vijnë udhëtimet.' },
  ],

  [T.DRIVER_WEEKLY]: [
    { key: 'dwk_summary', title: 'Java jote në TaxiMeIAfert 📊',
      body: 'Javën e kaluar kryeve {rides} udhëtime me xhiro {amount} €. Bravo, {name}! Le ta bëjmë këtë javë edhe më të mirë.' },
    { key: 'dwk_keep_going', title: 'Vazhdo kështu, {name}! 💪',
      body: '{rides} udhëtime dhe {amount} € xhiro javën e kaluar. Java e re sapo filloi.' },
  ],

  // ── Companies ───────────────────────────────────────────────────────────
  [T.COMPANY_MORNING]: [
    { key: 'cm_status', title: 'Gjendja e flotës sot 🚖',
      body: '{online} nga {total} shoferët tuaj janë online tani. Klientët po kërkojnë udhëtime.' },
    { key: 'cm_remind', title: 'Mirëmëngjes!',
      body: 'Vetëm {online} nga {total} shoferë janë online. Kujtojuni ekipit të hyjë në aplikacion.' },
    { key: 'cm_more_online', title: 'Më shumë shoferë online = më shumë fitim',
      body: 'Tani: {online}/{total} online. Mëngjesi është koha me kërkesa të shumta.' },
  ],

  [T.COMPANY_NO_DRIVERS]: [
    { key: 'cnd_add_first', title: 'Shtoni shoferin e parë 🚕',
      body: 'Kompania juaj është gati. Shtoni shoferët tuaj në aplikacion që të filloni të pranoni udhëtime.' },
    { key: 'cnd_clients', title: 'Klientët janë këtu, shoferët?',
      body: 'Ftoni shoferët tuaj të regjistrohen nën kompaninë tuaj dhe filloni të fitoni.' },
  ],

  [T.COMPANY_WEEKLY]: [
    { key: 'cwk_summary', title: 'Raporti javor i kompanisë 📊',
      body: 'Javën e kaluar flota juaj kreu {rides} udhëtime me xhiro {amount} €. Shikoni detajet në panel.' },
  ],

  // ── Clients ─────────────────────────────────────────────────────────────
  [T.CLIENT_FIRST_RIDE]: [
    { key: 'cf_free', title: 'Udhëtimi i parë është FALAS 🎁',
      body: 'Udhëtimi yt i parë brenda qytetit është pa pagesë. Porosit tani, {name}!' },
    { key: 'cf_try', title: 'Ende nuk e ke provuar?',
      body: 'Porosit taksinë me një prekje — udhëtimi i parë në qytet është dhuratë nga ne.' },
    { key: 'cf_waiting', title: 'Dhurata jote të pret 🚕',
      body: 'Udhëtimi i parë falas brenda qytetit është ende aktiv. Mos e humb!' },
  ],

  [T.CLIENT_WINBACK]: [
    { key: 'cw_miss', title: 'Na ke munguar, {name}! 👋',
      body: 'Shoferët tanë janë gati. Porosit taksinë tënde me një prekje.' },
    { key: 'cw_fast', title: 'Taksi në pak minuta 🚕',
      body: 'Kudo që duhet të shkosh sot, jemi këtu. Hap aplikacionin dhe porosit.' },
    { key: 'cw_safe', title: 'Udhëtim i sigurt, çmim i qartë',
      body: 'Shiko çmimin para se të nisesh dhe ndiq shoferin live në hartë.' },
    { key: 'cw_schedule', title: 'E di që mund ta rezervosh paraprakisht?',
      body: 'Planifiko udhëtimin për nesër që tani — shoferi do të jetë aty në kohë.' },
  ],

  [T.CLIENT_WEEKEND]: [
    { key: 'cwe_plans', title: 'Plane për fundjavë? 🎉',
      body: 'Dalje me shokët apo darkë familjare — ne të çojmë dhe të kthejmë të sigurt.' },
    { key: 'cwe_no_drive', title: 'Sonte mos drejto ti 🍽️',
      body: 'Shijo mbrëmjen pa u shqetësuar për parkimin. Porosit taksi me një prekje.' },
    { key: 'cwe_friday', title: 'E premte është! 🚕',
      body: 'Fundjava fillon tani. Kudo që të shkosh, {name}, një taksi është pak minuta larg.' },
  ],
};
