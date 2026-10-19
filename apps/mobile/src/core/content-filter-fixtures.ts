export const textCases: [string, boolean][] = [
  ['Shoot fuel, ferry, defense, trench, bump and robot breakage.', false],
  ['Scunthorpe chassis assembly; class assignment; cockpit.', false],
  ['694 scored 50; shooter shut down. Shift ended.', false],
  ['This is SHIT.', true], ['f.u.c.k', true], ['f u c k', true],
  ['f\u200bu\u200dc\u2060k', true], ['ｆｕｃｋ', true], ['f u c k i n g', true],
  ['You are an @55h0le!', true], ['b1tch', true], ['fucking', true],
  ['The shitake mechanism', false], ['Useful criticism: intake jammed again.', false],
];
