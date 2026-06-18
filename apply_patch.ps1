$file = "index.html"
$c = Get-Content $file -Raw -Encoding UTF8
$before1 = 'onclick="showTab(' + "'" + 'archive' + "'" + ')">Archive</button>'
$after1 = $before1 + "`n      <button class=""nav-tab"" id=""tab-volunteers"" style=""display:none;"" onclick=""showTab('volunteers')"">Volunteers</button>"
$c = $c.Replace($before1, $after1)
$before2 = '<div id="view-archive" style="display:none;"></div>'
$c = $c.Replace($before2, $before2 + "`n    <div id=""view-volunteers"" style=""display:none;""></div>")
$c = $c.Replace("'submit','artist','admin','orders','archive','settings'].forEach", "'submit','artist','admin','orders','archive','settings','volunteers'].forEach")
$c = $c.Replace("if(tab==='settings') loadSettings();", "if(tab==='settings') loadSettings();`n  if(tab==='volunteers') loadVolunteers();")
$c = $c.Replace("document.getElementById('tab-settings').style.display = _isAdmin ? '' : 'none';", "document.getElementById('tab-settings').style.display = _isAdmin ? '' : 'none';`n    document.getElementById('tab-volunteers').style.display = _isAdmin ? '' : 'none';")
$c | Set-Content $file -Encoding UTF8 -NoNewline
if ((Get-Content $file -Raw) -match "tab-volunteers") { Write-Host "SUCCESS" -ForegroundColor Green } else { Write-Host "FAILED" -ForegroundColor Red }
