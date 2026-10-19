#!/usr/bin/env python3
"""
Converte o Manual do Proprietário de uma unidade (.docx entregue) para supabase/manuais/*.json.

Uso:
  python3 -I scripts/converter-manual-proprietario.py "<manual da unidade>.docx" 201 supabase/manuais/soho-proprietario-201.json
Depois:
  node --env-file=.env.local scripts/importar-manual.mjs supabase/manuais/soho-proprietario-201.json

Lê a estrutura do Word do SOHO: títulos com estilos "1"/"11"/"111" (capítulo, seção, subseção), listas
"espoficial", subtítulos em negrito "Cuidados de uso:", "Manutenção preventiva:" e "Perda de garantia:",
tabela de prazos de garantia em 2.1.1 e fornecedores em tabelas no capítulo 6. A lista de projetos de 10.2
vira linhas de anexo. Confira o resultado no portal antes de publicar.
"""
import html, json, re, sys, zipfile

if len(sys.argv) != 4:
    sys.exit(__doc__)
DOCX, unit, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
zf = zipfile.ZipFile(DOCX)
x=zf.read('word/document.xml').decode('utf8')
body=x[x.index('<w:body>')+8:x.rindex('</w:body>')]
rels=dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"',zf.read('word/_rels/document.xml.rels').decode('utf8')))
def text(p):
    out=[]
    for m in re.finditer(r'<w:t[^>]*>([^<]*)</w:t>|<w:br/>|<w:tab/>',p):
        out.append(m.group(1) if m.group(1) is not None else (' ' if 'tab' in m.group(0) else '\n'))
    s=''.join(out)
    return s.replace('&amp;','&').replace('&lt;','<').replace('&gt;','>').replace('&quot;','"').replace('&apos;',"'")
def para(p):
    st=re.search(r'<w:pStyle w:val="([^"]+)"',p)
    num=re.search(r'<w:numPr>.*?<w:ilvl w:val="(\d+)"/>.*?<w:numId w:val="(\d+)"/>',p,re.S)
    imgs=[rels.get(r) for r in re.findall(r'r:embed="(rId\d+)"',p)]
    bold=bool(re.search(r'<w:b/>|<w:b w:val="1"/>',p))
    return {'t':'p','style':st.group(1) if st else None,'num':[int(num.group(2)),int(num.group(1))] if num else None,'text':text(p),'imgs':imgs,'bold':bold}
blocks=[]
pos=0
for m in re.finditer(r'<w:tbl>.*?</w:tbl>|<w:p[ >].*?</w:p>|<w:p/>',body,re.S):
    s=m.group(0)
    if s.startswith('<w:tbl>'):
        # nested tables unlikely; split rows/cells
        rows=[]
        for r in re.findall(r'<w:tr[ >].*?</w:tr>',s,re.S):
            cells=[]
            for c in re.findall(r'<w:tc>.*?</w:tc>',r,re.S):
                span=re.search(r'<w:gridSpan w:val="(\d+)"',c)
                cells.append({'text':'\n'.join(text(p) for p in re.findall(r'<w:p[ >].*?</w:p>',c,re.S)).strip(),'span':int(span.group(1)) if span else 1})
            rows.append(cells)
        blocks.append({'t':'tbl','rows':rows})
    elif s=='<w:p/>':
        continue
    else:
        blocks.append(para(s))

b = blocks
esc = lambda s: html.escape(s.strip(), quote=False)
def cap(s):
    s = s.strip().rstrip(':').strip()
    if s != s.upper(): return s[0].upper() + s[1:]
    low = s.lower(); out = low[0].upper() + low[1:]
    for k in ['SOHO','ABNT','NBR','PPCI','ART','AVCB','TV','GLP','OUZ']:
        out = re.sub(r'\b' + k.lower() + r'\b', k, out, flags=re.I)
    return out.replace('(rooftop)', '(Rooftop)')
LEVEL = {'1': 1, '11': 2, 'Ttulo2': 2, '111': 3}
SUBS = {'cuidados de uso': 'uso', 'manutenção preventiva': 'man', 'perda de garantia': 'perda'}
sections, cur, counters = [], None, [0, 0, 0]
WARR, SUP, MAN = [], [], []
attachments, maint = [], []
lst = []  # itens de lista pendentes
def flush():
    global lst
    if lst and cur is not None: cur['html'] += '<ul>' + ''.join(f'<li>{x}</li>' for x in lst) + '</ul>\n'
    lst = []
def add(h):
    flush()
    if cur is not None: cur['html'] += h + '\n'
# Antes do primeiro capítulo: "Sobre a OUZ" (texto entre o sumário e o capítulo 1).
first = next(i for i, x in enumerate(b) if x['t'] == 'p' and x['style'] == '1')
about = [x['text'] for x in b[:first] if x['t'] == 'p' and not (x['style'] or '').startswith(('Sumr', '1')) and x['text'].strip() and x['text'].strip() != 'SUMÁRIO' and not re.match(r'^\d+(\.\d+)*\.', x['text'])]
sections.append({'num': '0', 'title': 'Sobre a OUZ', 'level': 1, 'html': ''.join(f'<p>{esc(t)}</p>' for t in about)})
pane = None
for x in b[first:]:
    if x['t'] == 'tbl':
        rows = x['rows']
        if cur and cur['num'] == '2.1.1':
            for r in rows[2:]:
                n, system, *cols = [c['text'] for c in r]
                for i, t in enumerate(cols[:4]):
                    if t.strip(): WARR.append({'row': int(n), 'system': re.sub(r'\s+', ' ', system).strip(), 'aspect': re.sub(r'\s+', ' ', t).strip(), 'months': [12, 24, 36, 60][i]})
            continue
        if cur and cur['num'].startswith('6.'):
            for r in rows:
                for c in r:
                    L = [l.strip() for l in c['text'].split('\n') if l.strip()]
                    if not L: continue
                    tel = [l for l in L if re.match(r'^\(?\d{2}\)?\s*\d|^0800', l)]
                    mail = [re.sub(r'\s+', '', l) for l in L if '@' in l]
                    rest = [l for l in L if l not in tel and '@' not in l]
                    SUP.append({'group': cur['num'], 'category': rest[0] if rest else '', 'name': rest[1] if len(rest) > 1 else '', 'address': ', '.join(rest[2:]), 'phones': tel, 'emails': mail})
        trs = ''.join('<tr>' + ''.join((f'<td colspan="{c["span"]}">' if c['span'] > 1 else '<td>') + '<br>'.join(esc(l) for l in c['text'].split('\n') if l.strip()) + '</td>' for c in r) + '</tr>' for r in rows)
        add(f'<div class="tbl"><table>{trs}</table></div>')
        continue
    t = x['text'].strip()
    st = x['style']
    lvl = LEVEL.get(st)
    if lvl and t:
        # Na seção 10.2, a lista de projetos (formatada como título) vira linhas de anexo.
        if lvl == 3 and cur and cur['num'] == '10.2':
            attachments.append({'section': '10.2', 'title': re.sub(r'\s*”', '”', re.sub(r'\s+', ' ', cap(t.rstrip(';').strip())))})
            continue
        flush()
        counters[lvl - 1] += 1
        for k in range(lvl, 3): counters[k] = 0
        num = '.'.join(str(c) for c in counters[:lvl])
        cur = {'num': num, 'title': cap(t), 'level': lvl, 'html': ''}
        sections.append(cur); pane = None
        continue
    if not t: continue
    key = t.rstrip(':').strip().lower()
    if x['bold'] and key in SUBS and cur:
        add(f'<h4 class="sub sub-{SUBS[key]}">{esc(t.rstrip(":"))}</h4>'); pane = SUBS[key]; continue
    item = st == 'espoficial' or x['num'] is not None
    if item:
        lst.append(esc(t))
        if pane == 'man' and cur['num'].startswith('5.'): MAN.append({'section': cur['num'], 'system': cur['title'], 'description': t})
        continue
    if x['bold'] and len(t) < 120: add(f'<h4>{esc(t)}</h4>'); continue
    if pane == 'man' and cur and cur['num'].startswith('5.'): MAN.append({'section': cur['num'], 'system': cur['title'], 'description': t})
    add(f'<p>{esc(t)}</p>')
flush()

def freq(t):
    t = t.lower()
    for k, pat in [('diaria', r'diári|diariamente'), ('semanal', r'semana'), ('quinzenal', r'quinzen'),
                   ('plurianual', r'a cada (dois|2|três|3|quatro|4|cinco|5|dez|10) anos|bienal'), ('semestral', r'semest|seis meses|6 meses'),
                   ('trimestral', r'trimest|três meses|3 meses'), ('bimestral', r'bimest|dois meses|2 meses'), ('mensal', r'mensal|cada mês|todo mês'),
                   ('anual', r'anual|cada ano|a cada 1 ano|uma vez por ano')]:
        if re.search(pat, t): return k
    return 'conforme'
for m in MAN: m['frequency'] = freq(m['description'])
attachments = [{'section': '4.2.1', 'title': 'Manual de ligação de luz (residencial)'},
               {'section': '10.1', 'title': 'ART de elaboração dos manuais'}] + attachments + [
               {'section': '10.3.1', 'title': 'Programa de manutenção preventiva'},
               {'section': '10.3.2', 'title': 'Modelo de formulário para agendamento e programação das atividades de manutenção'},
               {'section': '10.3.3', 'title': 'Modelo de livro de registro'},
               {'section': '10.3.3', 'title': 'Modelos de listas de verificações para um subsistema'}]
out = {'development_slug': 'soho', 'kind': 'proprietario', 'unit_code': unit,
       'title': f'Manual do Proprietário · Apartamento {unit}',
       'source': f'Manual do Proprietário SOHO, apartamento {unit} (.docx entregue)',
       'sections': sections, 'warranty_items': WARR, 'maintenance': MAN, 'suppliers': SUP, 'legal_documents': [], 'attachments': attachments}
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=0)
print(len(sections), len(WARR), len(MAN), len(SUP), len(attachments))
import collections; print(collections.Counter(m['frequency'] for m in MAN))
