import {expect,test} from '@playwright/test';
import {renderAuditViewer} from '../../scripts/dialect-audit/viewer';

test('audit viewer shows rendered HTML, hides missing parsers and merges official Pandoc',async({page})=>{
 const html='<h1>Rendered heading</h1><script>parent.auditExecuted=true</script><img src="https://audit-invalid.example/image.png" onerror="parent.auditExecuted=true">';
 const rows=['markdown','gfm','obsidian'].map(variant=>({variant,id:'preview',source:'# Rendered heading',url:'https://example.com',startLine:1,expected:null,official:variant==='obsidian'?null:html,profiles:{default:{notdown:html,...(variant==='obsidian'?{}:{pandoc:html,comparison:{domEqual:true,textEqual:true}})}}}));
 const viewer=await renderAuditViewer(rows,rows.map(r=>({variant:r.variant})));
 await page.route('**/audit-viewer-test.html',route=>route.fulfill({contentType:'text/html',body:viewer}));
 const remote:string[]=[];page.on('request',req=>{if(req.url().includes('audit-invalid'))remote.push(req.url());});
 await page.goto('/audit-viewer-test.html');
 await page.locator('#kind').selectOption('all');
 await page.locator('#dialect').selectOption('markdown');
 await expect(page.locator('.col')).toHaveCount(2);
 await expect(page.locator('.col h3').first()).toHaveText('官方 · Pandoc HTML');
 await expect(page.frameLocator('iframe').first().locator('h1')).toHaveText('Rendered heading');
 await expect(page.locator('.html-code').first()).toContainText('<script>');
 await expect(page.frameLocator('iframe').first().locator('script,[onerror]')).toHaveCount(0);
 await expect(page.locator('iframe').first()).toHaveAttribute('sandbox','');
 await page.locator('#dialect').selectOption('gfm');
 await expect(page.locator('.col')).toHaveCount(3);
 await page.locator('#dialect').selectOption('obsidian');
 await expect(page.locator('.col')).toHaveCount(1);
 await expect(page.locator('.col h3')).toHaveText('Notdown HTML');
 expect(await page.evaluate(()=>(window as any).auditExecuted)).toBeUndefined();
 expect(remote).toEqual([]);
 await page.setViewportSize({width:600,height:820});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
