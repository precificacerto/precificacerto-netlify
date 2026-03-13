const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'docs', 'Precificação Lucro Real Industrialização.xlsx.xlsx');

const wb = XLSX.readFile(filePath, { cellFormula: true, cellStyles: true });

console.log('=== PLANILHA: Precificação Lucro Real Industrialização ===');
console.log('Abas:', wb.SheetNames.join(', '));
console.log('');

wb.SheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

    console.log(`\n${'='.repeat(80)}`);
    console.log(`=== ABA: "${sheetName}" === (Linhas: ${range.e.r + 1}, Colunas: ${range.e.c + 1})`);
    console.log(`${'='.repeat(80)}\n`);

    for (let r = range.s.r; r <= range.e.r; r++) {
        let rowHasContent = false;
        let rowOutput = [];

        for (let c = range.s.c; c <= range.e.c; c++) {
            const cellRef = XLSX.utils.encode_cell({ r, c });
            const cell = ws[cellRef];

            if (cell) {
                rowHasContent = true;
                let display = '';

                if (cell.f) {
                    // Has formula
                    display = `[FORMULA: =${cell.f}] => ${cell.v !== undefined ? cell.v : '(sem valor)'}`;
                } else if (cell.v !== undefined) {
                    display = String(cell.v);
                }

                if (display) {
                    rowOutput.push(`  ${cellRef}: ${display}`);
                }
            }
        }

        if (rowHasContent && rowOutput.length > 0) {
            console.log(`--- Linha ${r + 1} ---`);
            rowOutput.forEach(line => console.log(line));
        }
    }
});

// Also output as structured table for each sheet
console.log('\n\n=== VISÃO TABULAR ===\n');
wb.SheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName];
    console.log(`\n--- ABA: "${sheetName}" (como tabela) ---`);
    const data = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    console.log(data);
});
