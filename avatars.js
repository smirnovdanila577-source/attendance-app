/* ==========================================================================
   АВАТАРЫ
   Готовые мультяшные аватары (SVG 200×200). Закрытые открываются за достижения:
   поле unlock — id достижения из profile.js. Обычные (без unlock) появятся позже.
   ========================================================================== */
(function () {
  'use strict';
const INK = '#1d1622';
const S = `stroke="${INK}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"`;

const AVATARS = [
{
  id: 'owl', unlock: 'night_owl', name: 'Полуночник', ach: 'Ночной режим', hint: 'Загляни в трекер глубокой ночью',
  svg: `
  <defs><radialGradient id="owl-bg" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="#3b4f8c"/><stop offset="1" stop-color="#121a36"/></radialGradient></defs>
  <rect width="200" height="200" fill="url(#owl-bg)"/>
  <path d="M150 34 a20 20 0 1 0 14 34 a16 16 0 1 1 -14 -34z" fill="#f4e6b8"/>
  <g fill="#f4e6b8"><circle cx="38" cy="40" r="1.8"/><circle cx="60" cy="24" r="1.3"/><circle cx="118" cy="22" r="1.5"/><circle cx="26" cy="78" r="1.2"/><circle cx="176" cy="96" r="1.4"/></g>
  <path d="M56 70 L48 34 L80 58 Z M144 70 L152 34 L120 58 Z" fill="#6f5340" ${S}/>
  <path d="M100 52 C150 52 166 96 162 140 C158 184 132 206 100 206 C68 206 42 184 38 140 C34 96 50 52 100 52Z" fill="#8a6a4f" ${S}/>
  <path d="M70 150 q8 6 16 0 M92 162 q8 6 16 0 M114 150 q8 6 16 0 M80 176 q8 6 16 0 M104 176 q8 6 16 0" fill="none" stroke="#6f5340" stroke-width="3"/>
  <circle cx="74" cy="102" r="30" fill="#e2cfae" ${S}/>
  <circle cx="126" cy="102" r="30" fill="#e2cfae" ${S}/>
  <circle cx="76" cy="104" r="17" fill="#fffaf0" ${S}/>
  <circle cx="124" cy="104" r="17" fill="#fffaf0" ${S}/>
  <circle cx="81" cy="108" r="6.5" fill="${INK}"/><circle cx="129" cy="108" r="6.5" fill="${INK}"/>
  <circle cx="83" cy="106" r="2" fill="#fff"/><circle cx="131" cy="106" r="2" fill="#fff"/>
  <path d="M58 102 A18 18 0 0 1 94 100 L94 104 L58 104Z" fill="#b39572" ${S}/>
  <path d="M106 100 A18 18 0 0 1 142 102 L142 104 L106 104Z" fill="#b39572" ${S}/>
  <path d="M62 124 q14 8 28 0 M110 124 q14 8 28 0" fill="none" stroke="#9c8060" stroke-width="3"/>
  <path d="M92 118 L108 118 L100 134 Z" fill="#f2a33a" ${S}/>
  <path d="M32 150 C30 132 44 120 54 128" fill="none" ${S}/>
  <path d="M168 150 C170 132 156 120 146 128" fill="none" ${S}/>
  <rect x="22" y="140" width="22" height="30" rx="9" fill="#2c2f3d" ${S}/>
  <rect x="156" y="140" width="22" height="30" rx="9" fill="#2c2f3d" ${S}/>
  <path d="M120 158 h34 v30 a8 8 0 0 1 -8 8 h-18 a8 8 0 0 1 -8 -8z" fill="#f6f1e7" ${S}/>
  <path d="M154 166 a8 8 0 0 1 0 16" fill="none" ${S}/>
  <rect x="124" y="170" width="26" height="8" fill="#7a4b2e"/>
  <path d="M130 150 q-5 -7 0 -14 M142 150 q-5 -7 0 -14" fill="none" stroke="#e8e3f5" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>
  <path d="M112 186 q10 -16 22 -10" fill="#8a6a4f" ${S}/>`
},
{
  id: 'rooster', unlock: 'early_bird', name: 'Ранняя пташка', ach: 'Ранний старт', hint: 'Загляни в трекер до восьми утра',
  svg: `
  <defs><linearGradient id="roo-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf7a"/><stop offset=".55" stop-color="#ff8a4c"/><stop offset="1" stop-color="#d9485f"/></linearGradient></defs>
  <rect width="200" height="200" fill="url(#roo-bg)"/>
  <circle cx="100" cy="150" r="70" fill="#ffe2a3" opacity=".55"/>
  <path d="M0 168 Q100 140 200 168 V200 H0Z" fill="#b8384f" opacity=".5"/>
  <path d="M60 210 C58 168 70 136 100 134 C130 136 142 168 140 210Z" fill="#e8662c" ${S}/>
  <path d="M74 150 l10 16 l8 -18 l10 18 l8 -18 l10 16 l6 -14" fill="none" stroke="#b9431a" stroke-width="3"/>
  <path d="M100 46 C138 46 150 80 148 108 C146 136 128 150 100 150 C72 150 54 136 52 108 C50 80 62 46 100 46Z" fill="#fbf3e4" ${S}/>
  <path d="M78 52 C70 30 88 22 94 40 C94 20 114 18 112 40 C120 22 138 30 126 54 C112 46 92 44 78 52Z" fill="#e2333f" ${S}/>
  <path d="M54 84 h92" stroke="#2f6fd6" stroke-width="12"/>
  <path d="M54 84 h92" fill="none" ${S} stroke-width="0"/>
  <rect x="52" y="78" width="96" height="12" rx="3" fill="#2f6fd6" ${S}/>
  <path d="M60 84 h6 M134 84 h6" stroke="#fbf3e4" stroke-width="3"/>
  <path d="M62 100 h76 l-4 16 q-3 9 -14 9 h-6 q-10 0 -12 -9 l-2 -6 h-4 l-2 6 q-2 9 -12 9 h-6 q-11 0 -14 -9z" fill="${INK}" ${S}/>
  <path d="M74 106 l10 0 M116 106 l10 0" stroke="#6fd3ff" stroke-width="3" opacity=".9"/>
  <path d="M86 122 L114 122 L100 144 Z" fill="#f6b62a" ${S}/>
  <path d="M90 128 L100 132 L110 128" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M94 142 C88 152 92 164 100 162 C108 164 112 152 106 142Z" fill="#e2333f" ${S}/>
  <circle cx="122" cy="176" r="14" fill="#fbf3e4" ${S}/>
  <path d="M122 168 v8 l6 4" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M112 162 l-4 -6 M132 162 l4 -6" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`
},
{
  id: 'rhino', unlock: 'attend_100', name: 'Бронированный', ach: 'Несгибаемая воля', hint: 'Посети 100 пар',
  svg: `
  <defs><radialGradient id="rh-bg" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="#6d7f93"/><stop offset="1" stop-color="#26303d"/></radialGradient></defs>
  <rect width="200" height="200" fill="url(#rh-bg)"/>
  <path d="M0 150 L40 120 L70 140 L110 104 L150 132 L200 110 V200 H0Z" fill="#1e2630" opacity=".55"/>
  <path d="M26 200 C30 168 56 156 100 156 C144 156 170 168 174 200Z" fill="#5d6772" ${S}/>
  <path d="M30 186 C40 160 64 158 72 170 L66 200 H30Z" fill="#9aa6b2" ${S}/>
  <path d="M170 186 C160 160 136 158 128 170 L134 200 H170Z" fill="#9aa6b2" ${S}/>
  <circle cx="44" cy="178" r="3" fill="${INK}"/><circle cx="156" cy="178" r="3" fill="${INK}"/><circle cx="54" cy="190" r="3" fill="${INK}"/><circle cx="146" cy="190" r="3" fill="${INK}"/>
  <path d="M58 58 C50 40 62 34 72 48Z M142 58 C150 40 138 34 128 48Z" fill="#7d8894" ${S}/>
  <path d="M100 46 C142 46 160 72 158 104 C156 130 150 160 100 162 C50 160 44 130 42 104 C40 72 58 46 100 46Z" fill="#8f9aa6" ${S}/>
  <path d="M60 116 C70 108 84 110 86 120 M140 116 C130 108 116 110 114 120" fill="none" stroke="#6f7a86" stroke-width="3"/>
  <path d="M93 92 C93 80 97 70 100 62 C103 70 107 80 107 92Z" fill="#e2d4b2" ${S}/>
  <path d="M82 140 C78 118 88 100 100 82 C112 100 122 118 118 140Z" fill="#efe3c6" ${S}/>
  <path d="M92 132 C92 118 96 108 100 100" fill="none" stroke="#cbbb98" stroke-width="3" stroke-linecap="round"/>
  <path d="M60 94 l22 6 M140 94 l-22 6" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
  <path d="M64 104 q8 -4 14 0 q-7 6 -14 0z" fill="#fff" ${S} stroke-width="2.4"/>
  <path d="M122 104 q8 -4 14 0 q-7 6 -14 0z" fill="#fff" ${S} stroke-width="2.4"/>
  <circle cx="72" cy="104" r="2.6" fill="${INK}"/><circle cx="128" cy="104" r="2.6" fill="${INK}"/>
  <path d="M120 80 L142 118" stroke="#d98a9a" stroke-width="4" stroke-linecap="round"/>
  <path d="M124 92 l7 -3 M129 101 l7 -3 M134 110 l7 -3" stroke="${INK}" stroke-width="2"/>
  <ellipse cx="80" cy="146" rx="4.6" ry="3.2" fill="${INK}"/><ellipse cx="120" cy="146" rx="4.6" ry="3.2" fill="${INK}"/>
  <path d="M86 154 q14 5 28 -2" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`
},
{
  id: 'fox', unlock: 'streak_30', name: 'Огненный лис', ach: 'Серия 30 дней', hint: 'Отмечай пары 30 учебных дней подряд',
  svg: `
  <defs><radialGradient id="fx-bg" cx="50%" cy="85%" r="90%"><stop offset="0" stop-color="#7a1d1d"/><stop offset="1" stop-color="#180a10"/></radialGradient></defs>
  <rect width="200" height="200" fill="url(#fx-bg)"/>
  <path d="M30 200 L30 150 C20 110 40 92 46 70 C56 92 50 104 62 112 C58 84 74 54 98 34 C96 64 116 74 112 100 C126 92 128 74 140 62 C148 88 170 104 166 150 L166 200Z" fill="#ff7a1a"/>
  <path d="M52 200 L52 150 C48 124 60 112 64 98 C72 112 70 122 80 128 C80 110 92 90 104 78 C104 98 118 106 116 124 C126 118 128 108 136 100 C142 118 152 132 148 150 L148 200Z" fill="#ffc53d"/>
  <g fill="#ffb15a"><circle cx="34" cy="60" r="2"/><circle cx="170" cy="48" r="2.4"/><circle cx="160" cy="78" r="1.6"/><circle cx="22" cy="104" r="1.6"/><circle cx="182" cy="122" r="1.8"/></g>
  <path d="M40 210 C42 176 62 162 100 162 C138 162 158 176 160 210Z" fill="#23202b" ${S}/>
  <path d="M80 164 L100 192 L120 164" fill="none" stroke="#4a4556" stroke-width="3"/>
  <path d="M54 70 L60 30 L88 62Z M146 70 L140 30 L112 62Z" fill="#e8742c" ${S}/>
  <path d="M62 62 L64 42 L78 58Z M138 62 L136 42 L122 58Z" fill="#3a2230"/>
  <path d="M100 58 C140 58 156 84 154 108 C152 128 132 146 100 168 C68 146 48 128 46 108 C44 84 60 58 100 58Z" fill="#e8742c" ${S}/>
  <path d="M46 108 C60 128 80 134 92 134 L100 168 C68 146 50 130 46 108Z M154 108 C140 128 120 134 108 134 L100 168 C132 146 150 130 154 108Z" fill="#fbeedc" ${S}/>
  <path d="M66 98 q12 -8 24 0 q-12 10 -24 0z" fill="#ffd23f" ${S} stroke-width="2.6"/>
  <path d="M110 98 q12 -8 24 0 q-12 10 -24 0z" fill="#ffd23f" ${S} stroke-width="2.6"/>
  <path d="M78 93 v10 M122 93 v10" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M64 92 l28 -6 M136 92 l-28 -6" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
  <path d="M92 150 L108 150 L100 160Z" fill="${INK}"/>
  <path d="M100 160 v4 M88 164 q12 4 22 -4" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`
},
{
  id: 'raccoon', unlock: 'hw_10', name: 'Конспектёр', ach: 'Домашний мастер', hint: 'Выполни 10 домашних заданий',
  svg: `
  <defs><radialGradient id="rc-bg" cx="78%" cy="18%" r="90%"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".28" stop-color="#3d7c78"/><stop offset="1" stop-color="#132a2e"/></radialGradient></defs>
  <rect width="200" height="200" fill="url(#rc-bg)"/>
  <path d="M28 210 C30 176 58 162 100 162 C142 162 170 176 172 210Z" fill="#7b5c8f" ${S}/>
  <path d="M86 162 l14 18 l14 -18" fill="none" ${S}/>
  <path d="M52 70 C40 46 56 36 76 52Z M148 70 C160 46 144 36 124 52Z" fill="#8b8f98" ${S}/>
  <path d="M58 60 C52 50 58 46 68 54Z M142 60 C148 50 142 46 132 54Z" fill="#3a3a44"/>
  <path d="M100 50 C144 50 160 80 158 110 C156 140 132 160 100 160 C68 160 44 140 42 110 C40 80 56 50 100 50Z" fill="#a4a8b1" ${S}/>
  <path d="M44 100 C56 86 76 86 92 98 C96 102 104 102 108 98 C124 86 144 86 156 100 C152 118 132 126 118 118 C110 114 90 114 82 118 C68 126 48 118 44 100Z" fill="#2f2f3a" ${S}/>
  <path d="M100 116 C122 116 136 128 134 140 C132 152 116 158 100 158 C84 158 68 152 66 140 C64 128 78 116 100 116Z" fill="#eceef2" ${S}/>
  <circle cx="76" cy="104" r="17" fill="#bfe6ff" fill-opacity=".25" ${S}/>
  <circle cx="124" cy="104" r="17" fill="#bfe6ff" fill-opacity=".25" ${S}/>
  <path d="M93 102 h14" stroke="${INK}" stroke-width="3.2"/>
  <path d="M66 104 q10 -6 20 0 q-10 7 -20 0z" fill="#fff"/><path d="M114 104 q10 -6 20 0 q-10 7 -20 0z" fill="#fff"/>
  <circle cx="76" cy="105" r="3" fill="${INK}"/><circle cx="124" cy="105" r="3" fill="${INK}"/>
  <path d="M66 101 h20 M114 101 h20" stroke="#2f2f3a" stroke-width="3"/>
  <ellipse cx="100" cy="132" rx="9" ry="6" fill="${INK}"/>
  <path d="M90 146 q10 -4 20 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  <path d="M146 44 L176 74" stroke="#f4c542" stroke-width="9" stroke-linecap="round"/>
  <path d="M146 44 L176 74" fill="none" stroke="${INK}" stroke-width="2"/>
  <path d="M176 74 l6 6" stroke="#f4a3a8" stroke-width="9" stroke-linecap="round"/>
  <path d="M40 176 l46 -10 l6 30 l-46 10z" fill="#fdf7e6" ${S}/>
  <path d="M48 180 l32 -7 M50 188 l32 -7" stroke="#9aa6c8" stroke-width="2"/>
  <rect x="70" y="160" width="14" height="12" fill="#ffd84d" transform="rotate(-12 77 166)" ${S} stroke-width="2"/>`
},
{
  id: 'raven', unlock: 'scholar', name: 'Профессор', ach: 'Отличник', hint: 'Держи посещаемость от 80% на 30+ парах',
  svg: `
  <defs><radialGradient id="rv-bg" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="#6b4aa8"/><stop offset="1" stop-color="#1c1236"/></radialGradient></defs>
  <rect width="200" height="200" fill="url(#rv-bg)"/>
  <path d="M30 210 C32 172 60 158 100 158 C140 158 168 172 170 210Z" fill="#2a2433" ${S}/>
  <path d="M80 158 L100 178 L120 158 L100 168Z" fill="#f4f1ea" ${S}/>
  <path d="M90 176 l-14 -8 v16z M110 176 l14 -8 v16z" fill="#c23b4b" ${S} stroke-width="2.6"/>
  <circle cx="100" cy="176" r="4" fill="#c23b4b" ${S} stroke-width="2.4"/>
  <path d="M100 56 C142 56 156 86 154 114 C152 140 132 160 100 160 C68 160 48 140 46 114 C44 86 58 56 100 56Z" fill="#2b2a3a" ${S}/>
  <path d="M60 92 C66 74 80 66 96 66" fill="none" stroke="#5a7bd6" stroke-width="4" stroke-linecap="round" opacity=".7"/>
  <path d="M40 56 L100 34 L160 56 L100 78Z" fill="#191826" ${S}/>
  <path d="M70 66 v14 C84 88 116 88 130 80 v-14" fill="#191826" ${S}/>
  <path d="M100 56 C112 58 132 62 142 70 L144 92" fill="none" stroke="#e9b949" stroke-width="3"/>
  <path d="M138 92 h12 l-2 16 h-8z" fill="#e9b949" ${S} stroke-width="2.4"/>
  <path d="M72 106 q10 -6 20 0 q-10 6 -20 0z" fill="#fff" ${S} stroke-width="2.4"/>
  <circle cx="83" cy="106" r="3" fill="${INK}"/>
  <path d="M68 99 l26 4" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="122" cy="106" r="15" fill="#d6e8ff" fill-opacity=".3" stroke="#e9b949" stroke-width="4"/>
  <circle cx="122" cy="106" r="5" fill="#fff"/><circle cx="123" cy="107" r="3" fill="${INK}"/>
  <path d="M136 114 C146 130 140 146 132 156" fill="none" stroke="#e9b949" stroke-width="2"/>
  <path d="M84 120 C92 114 108 114 116 120 L100 152Z" fill="#4b4a5c" ${S}/>
  <path d="M86 122 L100 128 L114 122" fill="none" stroke="#6e6d82" stroke-width="2.6"/>`
},
{
  id: 'lion', unlock: 'league_podium', name: 'Лев недели', ach: 'Призёр лиги', hint: 'Займи место в тройке лиги недели',
  svg: `
  <defs><radialGradient id="ln-bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#f6c453"/><stop offset="1" stop-color="#7a3d12"/></radialGradient></defs>
  <rect width="200" height="200" fill="url(#ln-bg)"/>
  <g stroke="#ffe7a1" stroke-width="3" opacity=".35"><path d="M100 100 L100 0 M100 100 L190 20 M100 100 L200 110 M100 100 L10 20 M100 100 L0 110"/></g>
  <path d="M100 30 L118 46 L140 38 L146 60 L168 66 L160 88 L176 106 L158 120 L162 144 L138 146 L128 168 L106 158 L84 172 L76 150 L52 150 L54 126 L34 112 L50 94 L40 72 L62 66 L66 44 L88 48Z" fill="#a8521c" ${S}/>
  <path d="M30 210 C34 178 60 166 100 166 C140 166 166 178 170 210Z" fill="#20202a" ${S}/>
  <path d="M70 166 C80 186 120 186 130 166" fill="none" stroke="#f2c230" stroke-width="5"/>
  <circle cx="100" cy="186" r="12" fill="#f2c230" ${S}/>
  <path d="M97 181 l4 -3 v14" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M100 62 C134 62 148 86 146 110 C144 134 126 152 100 152 C74 152 56 134 54 110 C52 86 66 62 100 62Z" fill="#e3a65a" ${S}/>
  <path d="M66 70 C60 58 70 52 78 62Z M134 70 C140 58 130 52 122 62Z" fill="#e3a65a" ${S}/>
  <path d="M86 128 C88 120 112 120 114 128 C116 140 108 146 100 146 C92 146 84 140 86 128Z" fill="#f6dfb6" ${S}/>
  <path d="M68 102 q10 -5 20 0 q-10 6 -20 0z M112 102 q10 -5 20 0 q-10 6 -20 0z" fill="#fff" ${S} stroke-width="2.4"/>
  <circle cx="80" cy="103" r="3" fill="${INK}"/><circle cx="124" cy="103" r="3" fill="${INK}"/>
  <path d="M66 98 l22 -2 M134 98 l-22 -2" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M92 120 L108 120 L100 130Z" fill="#6b3a2a" ${S} stroke-width="2.4"/>
  <path d="M100 130 v4 M90 136 q8 6 20 -2" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M74 62 L72 38 L86 50 L98 30 L108 50 L122 40 L120 64 Z" fill="#f2c230" ${S} transform="rotate(-14 98 50)"/>
  <circle cx="92" cy="54" r="3.4" fill="#d9364a" transform="rotate(-14 98 50)"/>`
},
{
  id: 'capy', unlock: 'first_friend', name: 'Дипломат', ach: 'Первый друг', hint: 'Пригласи в трекер первого друга',
  svg: `
  <defs><linearGradient id="cp-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3b4"/><stop offset=".62" stop-color="#7fbf8f"/><stop offset=".62" stop-color="#4f9fb0"/><stop offset="1" stop-color="#2e6f86"/></linearGradient></defs>
  <rect width="200" height="200" fill="url(#cp-bg)"/>
  <path d="M10 140 q20 -6 40 0 M140 132 q20 -6 40 0" stroke="#d8f1f5" stroke-width="3" fill="none" opacity=".7"/>
  <path d="M36 210 C38 172 62 156 100 156 C138 156 162 172 164 210Z" fill="#9a6a45" ${S}/>
  <path d="M86 160 L100 172 L114 160 L114 176 L100 168 L86 176Z" fill="#c63d5a" ${S} stroke-width="2.6"/>
  <path d="M60 64 C54 54 62 48 70 56Z M140 64 C146 54 138 48 130 56Z" fill="#8c5d3b" ${S}/>
  <path d="M58 70 C58 56 74 50 100 50 C126 50 142 56 142 70 L148 128 C150 150 130 162 100 162 C70 162 50 150 52 128Z" fill="#b07a50" ${S}/>
  <path d="M70 124 C70 112 84 108 100 108 C116 108 130 112 130 124 C130 140 118 148 100 148 C82 148 70 140 70 124Z" fill="#8c5d3b" ${S}/>
  <ellipse cx="88" cy="120" rx="5" ry="3" fill="${INK}"/><ellipse cx="112" cy="120" rx="5" ry="3" fill="${INK}"/>
  <path d="M92 136 q8 4 16 0" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M70 90 q8 5 16 0 M114 90 q8 5 16 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="100" cy="40" r="14" fill="#ff9a1f" ${S}/>
  <path d="M100 26 C104 18 112 18 116 22 C110 24 104 26 100 26Z" fill="#4fae4a" ${S} stroke-width="2.4"/>
  <path d="M100 30 v-4" stroke="${INK}" stroke-width="2.4"/>`
},
{
  id: 'cat', unlock: 'important', name: 'Стратег', ach: 'Стратег', hint: 'Отметь важный предмет закладкой',
  svg: `
  <defs><radialGradient id="ct-bg" cx="50%" cy="30%" r="85%"><stop offset="0" stop-color="#2f6b4f"/><stop offset="1" stop-color="#0e2a20"/></radialGradient>
  <pattern id="ct-ch" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#ffffff" opacity=".06"/><rect x="20" y="20" width="20" height="20" fill="#ffffff" opacity=".06"/></pattern></defs>
  <rect width="200" height="200" fill="url(#ct-bg)"/><rect width="200" height="200" fill="url(#ct-ch)"/>
  <path d="M32 210 C34 172 62 158 100 158 C138 158 166 172 168 210Z" fill="#5b2a2a" ${S}/>
  <path d="M60 164 C80 176 120 176 140 164 L134 184 C118 192 82 192 66 184Z" fill="#c9a24a" ${S}/>
  <path d="M52 76 L50 34 L84 58Z M148 76 L150 34 L116 58Z" fill="#7d8088" ${S}/>
  <path d="M144 44 l-6 6 l6 4" fill="none" stroke="#0e2a20" stroke-width="5"/>
  <path d="M58 70 L58 48 L76 60Z" fill="#e7a3a8"/>
  <path d="M100 54 C140 54 158 82 156 110 C154 138 132 160 100 160 C68 160 46 138 44 110 C42 82 60 54 100 54Z" fill="#9a9da6" ${S}/>
  <path d="M100 56 v20 M86 58 l4 16 M114 58 l-4 16" stroke="#6c6f78" stroke-width="4" stroke-linecap="round"/>
  <path d="M46 110 l16 2 M46 122 l16 -2 M154 110 l-16 2 M154 122 l-16 -2" stroke="#6c6f78" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M64 104 q12 -10 26 0 q-13 10 -26 0z M110 104 q12 -10 26 0 q-13 10 -26 0z" fill="#b8e04a" ${S} stroke-width="2.6"/>
  <path d="M77 98 v12 M123 98 v12" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M62 98 l28 6 M138 98 l-28 6" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
  <path d="M94 124 L106 124 L100 132Z" fill="#e7a3a8" ${S} stroke-width="2.4"/>
  <path d="M100 132 q-6 8 -14 4 M100 132 q8 6 16 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M60 126 l-30 -4 M60 132 l-30 4 M140 126 l30 -4 M140 132 l30 4" stroke="#e8e9ec" stroke-width="2" stroke-linecap="round"/>
  <path d="M128 192 L130 176 C124 168 124 156 132 148 L128 140 L138 142 C146 134 160 134 168 144 L174 156 C176 162 170 166 164 162 L158 158 C154 162 154 168 158 174 L162 192Z" fill="#f2efe6" ${S}/>
  <path d="M136 150 C134 160 134 170 138 178 M142 146 C140 156 140 166 144 174" fill="none" stroke="#c9c3b2" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="156" cy="146" r="2.6" fill="${INK}"/>
  <rect x="122" y="190" width="46" height="10" rx="4" fill="#f2efe6" ${S}/>`
}
];

  const byId = id => AVATARS.find(a => a.id === id) || null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Открыт ли аватар: без условия — всегда, иначе нужно достижение (achievements — объект { id: дата })
  const isUnlocked = (a, achievements) => !!a && (!a.unlock || !!(achievements && achievements[a.unlock]));
  // Разметка аватара: картинка, если id известен, иначе первая буква ника
  // У каждой копии аватара свои id градиентов: одинаковые id на странице ломают заливку у копий
  let copies = 0;
  function html(id, name) {
    const a = byId(id);
    if (a) {
      const k = '-' + (++copies).toString(36);
      const body = a.svg.replace(/id="([^"]+)"/g, `id="$1${k}"`).replace(/url\(#([^)]+)\)/g, `url(#$1${k})`);
      return `<svg class="av-svg" viewBox="0 0 200 200" aria-hidden="true">${body}</svg>`;
    }
    return esc((String(name || 'С').trim().charAt(0) || 'С').toUpperCase());
  }
  window.Avatars = { list: AVATARS, byId, isUnlocked, html };
})();
