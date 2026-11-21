from playwright.sync_api import sync_playwright
from pathlib import Path
import fitz
root=Path(__file__).parents[1]
out=root/'tests'/'_artifacts';out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(accept_downloads=True,viewport={'width':1220,'height':980},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda err: errors.append(str(err)))
    page.goto('http://127.0.0.1:5173/',wait_until='networkidle')
    page.locator('#jsonFile').set_input_files(str(root/'tests'/'example-proxy-response.json'))
    page.wait_for_function("document.querySelector('#status').textContent.includes('FIKTIVE TESTDATEN')")
    assert page.locator('#home').input_value()=='Musterverein Heim'
    assert page.locator('#gameNumber').input_value()==''
    assert page.locator('#date').input_value()=='21.11.2026'
    assert page.locator('#hall').input_value()=='Muster-Sporthalle'
    assert page.locator('#fee1').input_value()==''
    assert page.locator('#fee2').input_value()==''
    page.locator('#fee1').fill('15,00')
    page.locator('#fee2').fill('15,00')
    page.locator('#referee1').fill('Muster Person')
    page.locator('#street1').fill('Musterweg 1')
    page.locator('#postalCode1').fill('24119')
    page.locator('#city1').fill('Kronshagen')
    page.locator('#saveProfile1').click()
    profile=page.locator('#profile1').input_value()
    assert profile
    page.locator('#profile1').select_option('')
    assert page.locator('#street1').input_value()==''
    page.locator('#profile1').select_option(profile)
    assert page.locator('#street1').input_value()=='Musterweg 1'
    page.screenshot(path=str(out/'desktop.png'),full_page=True)
    with page.expect_download(timeout=20000) as event:
        page.locator('#exportButton').click()
    download=event.value
    download.save_as(str(out/'test_hvsh.pdf'))
    assert 'HVSH_Abrechnung_591223.pdf' == download.suggested_filename
    assert not errors,errors
    browser.close()
pdf=fitz.open(out/'test_hvsh.pdf');assert len(pdf)==1
text=pdf[0].get_text()
print('PDF characters:',len(text),repr(text[:250]))
assert 'Musterverein Heim' in text,repr(text)
assert 'Musterverein Gast' in text
assert text.count('15,00')==2,repr(text)
assert 'Musterliga / Musterstaffel' in text
assert 'Musterstadt' in text
assert 'Musterweg 1' in text
assert '24119 Kronshagen' in text
assert '591223' not in text
assert pdf[0].rect.width>590 and pdf[0].rect.height>840
pix=pdf[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False)
pix.save(str(out/'test_hvsh.png'))
print('Browser smoke test passed:',len(pdf),'page(s)')
