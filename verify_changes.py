"""Run with playwright and pyproj installed; uses a temporary copy of the app."""
import functools, http.server, json, math, pathlib, shutil, tempfile, threading
from playwright.sync_api import sync_playwright
from pyproj import Transformer

root=pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='mgr-qa-') as tmp:
    for name in ['index.html','proj4.js','sw.js','version.js','manifest.webmanifest','icons']:
        src=root/name
        if src.is_dir(): shutil.copytree(src,pathlib.Path(tmp)/name)
        else: shutil.copy2(src,tmp)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*args): pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=tmp))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}'
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='chrome',headless=True)
        context=browser.new_context()
        page=context.new_page(); errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(url); page.evaluate('navigator.serviceWorker.ready'); page.wait_for_function('!!navigator.serviceWorker.controller')
        assert page.locator('#refresh').count()==0
        assert not page.locator('#updateMsg').is_visible()
        assert '/issues/new' in page.locator('.feedback').get_attribute('href')
        transform=Transformer.from_crs(4326,32756,always_xy=True)
        for lat,lon in [(-22.81253,150.13259),(-22.80307,150.33732),(-22.2,150.7)]:
            expected=transform.transform(lon,lat)
            actual=page.evaluate('([lat,lon])=>toProjFromWGS(lat,lon,"UTM56S")',[lat,lon])
            assert abs(actual['E']-expected[0])<.01 and abs(actual['N']-expected[1])<.01
            for digits in [3,4,5]:
                for crop in [True,False]:
                    result=page.evaluate('''([lat,lon,digits,crop])=>{
                      const S=defaultSettings(); S.australia={sgDigits:digits,sgOmit:crop,square:suggestedSquare('australia',[{lat,lon}])};
                      const cells=formatPoint(lat,lon,'australia',S);
                      return {cells,point:parseCells('australia',...cells,S)};
                    }''',[lat,lon,digits,crop])
                    assert 'error' not in result['point'],result
                    e,n=transform.transform(result['point']['lon'],result['point']['lat'])
                    tolerance=10**(5-digits) if crop else 1
                    assert abs(e-expected[0])<=tolerance+.1 and abs(n-expected[1])<=tolerance+.1,result
        assert page.evaluate('suggestedGrid([{lat:-22.8,lon:150.3}])')=='australia'
        assert page.evaluate('parseCells("australia","1234","5678",defaultSettings()).error')=='pick-square'
        full=page.evaluate('formatPoint(-22.8,150.3,"australia",defaultSettings())')
        assert len(full[0])==6 and len(full[1])==7,full
        page.select_option('#toSys','sg'); page.locator('#fromRows .a').first.fill('1234'); page.locator('#fromRows .b').first.fill('5678'); page.click('#convertBtn')
        assert page.get_by_text('Same grid, same place.',exact=False).is_visible()
        page.click('#tab-set'); page.click('[data-head="australia"]'); page.click('#mapbtn_australia')
        assert page.locator('#sqMap').get_by_text('Camp Tilpal').is_visible()
        assert page.locator('#sqMap .sqbox').count()>0
        page.locator('#sqMap .sqbox').first.dispatch_event('click')
        assert page.locator('.ao-status').is_visible()
        page.click('[data-head="thailand"]'); page.click('#mapbtn_thailand')
        assert 'Wang Pho' not in page.locator('#sqMap').inner_text()
        assert page.locator('#sqMap').get_by_text('Sai Yok').is_visible()
        page.locator('#sqMap .sqbox').first.dispatch_event('click'); page.click('#tab-conv')
        page.set_viewport_size({'width':390,'height':844})
        page.screenshot(path=str(pathlib.Path(tmp)/'qa-mobile.png'),full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        before=page.evaluate('localStorage.getItem("mgrconv-v1")')
        pathlib.Path(tmp,'version.js').write_text('globalThis.APP_VERSION = "1.4.0-test";')
        page.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.update())')
        page.locator('#updateMsg').wait_for(state='visible')
        assert page.locator('#appVersion').inner_text()=='v1.4.0'
        page.click('#updateMsg'); page.wait_for_function('globalThis.APP_VERSION === "1.4.0-test"')
        assert json.loads(page.evaluate('localStorage.getItem("mgrconv-v1")'))['rows']==json.loads(before)['rows']
        context.set_offline(True); page.reload(); assert page.locator('#appVersion').inner_text()=='v1.4.0-test'
        assert not errors,errors
        browser.close()
    server.shutdown()
print('PASS: independent projection accuracy, cropped/full round trips, AO selection, same-system message, mobile layout, update activation and offline reload')
