const fs = require('fs');
const path = require('path');
const dirs = [
  'c:/Users/ShreyashK/Desktop/LMS/apps/web/components/participant'
];
let changedFiles = 0;
for (const dir of dirs) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (!f.endsWith('.tsx')) continue;
    const fp = path.join(dir, f);
    let code = fs.readFileSync(fp, 'utf8');
    let orig = code;
    
    // Replace repeat(4, 1fr) with className='xa-kpi-4'
    code = code.replace(/<div\s+style=\{\{\s*display:\s*['"]grid['"],\s*gridTemplateColumns:\s*['"]repeat\(4,1fr\)['"]([^}]*)\}\}>/g, '<div className="xa-kpi-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)"$1 }}>');
    
    // Replace repeat(3, 1fr) with className='xa-kpi-3'
    code = code.replace(/<div\s+style=\{\{\s*display:\s*['"]grid['"],\s*gridTemplateColumns:\s*['"]repeat\(3,1fr\)['"]([^}]*)\}\}>/g, '<div className="xa-kpi-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)"$1 }}>');

    // Replace 1fr 1fr with className='xa-two-col'
    code = code.replace(/<div\s+style=\{\{\s*display:\s*['"]grid['"],\s*gridTemplateColumns:\s*['"]1fr\s+1fr['"]([^}]*)\}\}>/g, '<div className="xa-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr"$1 }}>');

    if (code !== orig) {
      fs.writeFileSync(fp, code);
      changedFiles++;
      console.log('Modified: ' + fp);
    }
  }
}
console.log('Total files modified: ' + changedFiles);
