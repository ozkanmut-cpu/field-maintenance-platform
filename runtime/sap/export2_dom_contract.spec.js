const test = require('node:test');
const assert = require('node:assert/strict');
const { firefox } = require('playwright');
const {
  captureActiveSearchState,
  configureExport2,
  verifyExport2SearchDelta,
} = require('./export2_search_verify');

const prefix = 'C19_W52_V53_V59_btqsrvcfm';

test('Export 2 configures, captures and verifies the SAP value-control DOM in a browser', async () => {
  const browser = await firefox.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const dateId = `${prefix}_PARAMETERS[1].VALUE1`;
    const dateItemsId = `${dateId}__items`;

    await page.setContent(`
      <!doctype html>
      <html lang="tr">
        <body>
          <section aria-label="SAP arama parametreleri">
            <input id="${prefix}_PARAMETERS[1].FIELD__key" value="DATE_RANGE">
            <input id="${dateId}" value="Bugün">
            <button id="${dateId}-btn" type="button">Tarih seçenekleri</button>
            <div id="${dateItemsId}" hidden>
              <a href="#" key="T*0" data-value="Bugün">Bugün</a>
              <a href="#" key="W*2" data-value="&lt;- 14 gün -&gt;">Son 14 gün</a>
            </div>

            <input id="${prefix}_PARAMETERS[2].FIELD__key" value="PRODUCT_ID">
            <input id="${prefix}_PARAMETERS[2].VALUE1" value="203">
            <input id="${prefix}_max_hits" value="1000">
          </section>
          <script>
            const dateInput = document.getElementById(${JSON.stringify(dateId)});
            const dateItems = document.getElementById(${JSON.stringify(dateItemsId)});
            document.getElementById(${JSON.stringify(`${dateId}-btn`)}).addEventListener('click', () => {
              dateItems.hidden = false;
            });
            dateItems.addEventListener('click', (event) => {
              const option = event.target.closest('a[key]');
              if (!option) return;
              event.preventDefault();
              dateInput.value = option.dataset.value;
              dateInput.dispatchEvent(new Event('change', { bubbles: true }));
              dateItems.hidden = true;
            });
          </script>
        </body>
      </html>
    `);

    const configured = await configureExport2(page);
    assert.deepEqual(configured, {
      date: '<- 14 gün ->',
      product: '',
      max: '2000',
    });

    const captured = await captureActiveSearchState(page);
    assert.deepEqual(captured, {
      max: '2000',
      slots: [
        { slot: 1, key: 'DATE_RANGE', value1: '<- 14 gün ->', value2: null },
        { slot: 2, key: 'PRODUCT_ID', value1: '', value2: null },
      ],
    });

    assert.deepEqual(verifyExport2SearchDelta({
      max: '1000',
      slots: [
        { slot: 1, key: 'DATE_RANGE', value1: '<- 14 gün ->', value2: null },
        { slot: 2, key: 'PRODUCT_ID', value1: '203', value2: null },
      ],
    }, captured), captured);
  } finally {
    await browser.close();
  }
});
