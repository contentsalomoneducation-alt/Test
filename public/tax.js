// Logic tính thuế TNCN dùng chung cho trình duyệt và máy chủ.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Tax = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Biểu thuế lũy tiến từng phần (thu nhập tính thuế theo tháng)
  const BRACKETS = [
    { upTo: 10_000_000, rate: 0.05 },
    { upTo: 30_000_000, rate: 0.10 },
    { upTo: 60_000_000, rate: 0.20 },
    { upTo: 100_000_000, rate: 0.30 },
    { upTo: Infinity, rate: 0.35 },
  ];

  const DEFAULT_SETTINGS = {
    selfDed: 15_500_000,
    depDed: 6_200_000,
    capSI: 46_800_000, // trần BHXH, BHYT
    capUI: 99_200_000, // trần BHTN
  };

  const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);

  function calcInsurance(insSalary, capSI, capUI) {
    const si = Math.min(insSalary, capSI);
    const ui = Math.min(insSalary, capUI);
    return Math.round(si * 0.08 + si * 0.015 + ui * 0.01);
  }

  function calcTax(taxable) {
    let prev = 0;
    let total = 0;
    const parts = BRACKETS.map((b) => {
      const amount = Math.max(0, Math.min(taxable, b.upTo) - prev);
      const tax = Math.round(amount * b.rate);
      const row = { from: prev, upTo: b.upTo, rate: b.rate, tax };
      prev = b.upTo;
      total += tax;
      return row;
    });
    return { total, parts };
  }

  function calculate(input, settings) {
    const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    const gross = num(input.gross);
    const exempt = num(input.exempt);
    const dependents = Math.min(50, Math.floor(num(input.dependents)));
    const hasIns = !!input.hasIns;
    const insSalary = input.insSalary == null || input.insSalary === '' ? gross : num(input.insSalary);
    const ins = hasIns ? calcInsurance(insSalary, num(s.capSI), num(s.capUI)) : 0;
    const selfDed = num(s.selfDed);
    const depTotal = dependents * num(s.depDed);
    const taxable = Math.max(0, gross - exempt - ins - selfDed - depTotal);
    const { total: tax, parts } = calcTax(taxable);
    return { gross, exempt, dependents, hasIns, ins, selfDed, depTotal, taxable, tax, parts, net: gross - ins - tax };
  }

  return { BRACKETS, DEFAULT_SETTINGS, calcInsurance, calcTax, calculate };
});
