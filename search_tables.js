const fs = require('fs');
const path = require('path');
const dirs = ['superadmin', 'pm', 'communications', 'cohorts', 'dashboard'];
let tablesFound = [];

function search(dir) {
  const full = path.join('c:/Users/ShreyashK/Desktop/LMS/apps/web/components', dir);
  if (!fs.existsSync(full)) return;
  const files = fs.readdirSync(full);
  for (const f of files) {
    const fp = path.join(full, f);
    if (fs.statSync(fp).isDirectory()) {
      search(path.join(dir, f));
      continue;
    }
    if (!f.endsWith('.tsx')) continue;
    
    let lines = fs.readFileSync(fp, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('<table')) {
        let wrapped = false;
        for (let j = Math.max(0, i - 4); j <= i; j++) {
          if (lines[j].includes('overflowX: "auto"') || lines[j].includes('xa-table-wrap') || lines[j].includes('overflowX: "scroll"')) {
            wrapped = true;
          }
        }
        if (!wrapped) {
          tablesFound.push({ file: path.join(dir, f), line: i + 1, content: lines[i].trim() });
        }
      }
    }
  }
}

for (const d of dirs) search(d);
console.log(JSON.stringify(tablesFound, null, 2));
