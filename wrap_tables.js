const fs = require('fs');
const path = require('path');

const targets = [
  { file: "superadmin/AuditLog.tsx", line: 252 },
  { file: "superadmin/BillingPage.tsx", line: 228 },
  { file: "superadmin/BillingPage.tsx", line: 280 },
  { file: "superadmin/FacultyDashboard.tsx", line: 107 },
  { file: "superadmin/FacultyFeedback.tsx", line: 63 },
  { file: "superadmin/RoleManagement.tsx", line: 350 },
  { file: "superadmin/RoleManagement.tsx", line: 428 },
  { file: "superadmin/RoleManagement.tsx", line: 486 },
  { file: "pm/PMRoleManagement.tsx", line: 226 },
  { file: "communications/PMComms.tsx", line: 698 },
  { file: "communications/PMComms.tsx", line: 838 },
  { file: "cohorts/CohortManagement.tsx", line: 862 }
];

// Group by file
const byFile = {};
for (const t of targets) {
  if (!byFile[t.file]) byFile[t.file] = [];
  byFile[t.file].push(t.line - 1); // 0-indexed
}

for (const relPath in byFile) {
  const fp = path.join('c:/Users/ShreyashK/Desktop/LMS/apps/web/components', relPath);
  let lines = fs.readFileSync(fp, 'utf8').split('\n');
  
  // Sort lines descending so we don't mess up indices
  const targetLines = byFile[relPath].sort((a,b) => b - a);
  
  for (const idx of targetLines) {
    if (!lines[idx].includes('<table')) continue;
    
    // Find matching </table>
    let closeIdx = -1;
    let openCount = 0;
    for (let i = idx; i < lines.length; i++) {
      if (lines[i].includes('<table')) openCount++;
      if (lines[i].includes('</table>')) openCount--;
      if (openCount === 0) {
        closeIdx = i;
        break;
      }
    }
    
    if (closeIdx !== -1) {
      // Extract the indentation of the <table line
      const match = lines[idx].match(/^(\s*)/);
      const indent = match ? match[1] : '';
      
      lines[closeIdx] = lines[closeIdx].replace('</table>', '</table>\n' + indent + '</div>');
      lines[idx] = lines[idx].replace('<table', '<div className="xa-table-wrap">\n' + indent + '  <table');
    }
  }
  
  fs.writeFileSync(fp, lines.join('\n'));
  console.log('Updated ' + relPath);
}
