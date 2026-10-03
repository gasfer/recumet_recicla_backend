const test = require('node:test');
const assert = require('node:assert/strict');
const providerFrequencyService = require('../app/services/provider-frequency.service');

test('classifyFrequency clasifica correctamente los rangos establecidos', () => {
  // 1-10 días = Semanal
  assert.equal(providerFrequencyService.classifyFrequency(1).code, 'WEEKLY');
  assert.equal(providerFrequencyService.classifyFrequency(7.33).code, 'WEEKLY');
  assert.equal(providerFrequencyService.classifyFrequency(10).code, 'WEEKLY');

  // 11-17 días = Quincenal
  assert.equal(providerFrequencyService.classifyFrequency(11).code, 'BIWEEKLY');
  assert.equal(providerFrequencyService.classifyFrequency(15).code, 'BIWEEKLY');
  assert.equal(providerFrequencyService.classifyFrequency(17).code, 'BIWEEKLY');

  // 18-45 días = Mensual
  assert.equal(providerFrequencyService.classifyFrequency(18).code, 'MONTHLY');
  assert.equal(providerFrequencyService.classifyFrequency(30).code, 'MONTHLY');
  assert.equal(providerFrequencyService.classifyFrequency(45).code, 'MONTHLY');

  // 46-120 días = Trimestral
  assert.equal(providerFrequencyService.classifyFrequency(46).code, 'QUARTERLY');
  assert.equal(providerFrequencyService.classifyFrequency(90).code, 'QUARTERLY');
  assert.equal(providerFrequencyService.classifyFrequency(120).code, 'QUARTERLY');

  // 121+ días = Anual
  assert.equal(providerFrequencyService.classifyFrequency(121).code, 'ANNUAL');
  assert.equal(providerFrequencyService.classifyFrequency(365).code, 'ANNUAL');
});
