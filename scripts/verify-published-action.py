import base64
import json
import os
import pathlib
import re
import shutil
import sys
import urllib.request

root = pathlib.Path('action-test-vault')
mode = sys.argv[1]
base = 'https://markdown-confluence.atlassian.net'

def get(path):
    auth = base64.b64encode((os.environ['ATLASSIAN_USERNAME'] + ':' + os.environ['ATLASSIAN_API_TOKEN']).encode()).decode()
    request = urllib.request.Request(base + '/wiki/rest/api/' + path, headers={'Authorization': 'Basic ' + auth, 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)

if mode == 'prepare':
    assert get('content/986448062?expand=space')['space']['key'] == 'MCRT20260907'
    shutil.copytree('test-fixtures/release-vault', root)
    prefix = 'Action 6 ' + os.environ['GITHUB_RUN_ID'] + '-' + os.environ['GITHUB_RUN_ATTEMPT'] + ' '
    for file in root.rglob('*.md'):
        file.write_text(re.sub(r'^connie-title: (.+)$', lambda m: 'connie-title: ' + prefix + m[1], file.read_text(), flags=re.M))
    config = {'pageHeaderMarkdown': 'Verified using the published GitHub Action.', 'pageFooterMarkdown': 'End of Action verification.', 'ignoredCodeBlockLanguages': ['dataview', 'button']}
    (root / '.markdown-confluence.json').write_text(json.dumps(config))
elif mode == 'modify':
    file = root / 'Release Tests/Formatting.md'
    file.write_text(file.read_text() + '\n\nPUBLISHED ACTION UPDATE SENTINEL.\n')
else:
    pages = {}
    for file in root.rglob('*.md'):
        match = re.search(r'^connie-page-id:\s*[\'\"]?(\d+)', file.read_text(), re.M)
        if not match:
            continue
        page = get('content/' + match[1] + '?expand=space,version,body.atlas_doc_format,ancestors')
        assert page['space']['key'] == 'MCRT20260907'
        attachments = get('content/' + page['id'] + '/child/attachment?limit=250&expand=version')['results']
        labels = get('content/' + page['id'] + '/label?limit=250')['results']
        pages[str(file.relative_to(root))] = {'id': page['id'], 'title': page['title'], 'version': page['version']['number'], 'adf': json.loads(page['body']['atlas_doc_format']['value']), 'attachments': {a['title']: a['version']['number'] for a in attachments}, 'labels': sorted(a['name'] for a in labels), 'ancestors': [a['id'] for a in page['ancestors']]}
    assert len(pages) == 7, len(pages)
    assert len(pages['Release Tests/Media.md']['attachments']) >= 6
    assert 'release-test' in pages['Tagged/Tag selection.md']['labels']
    assert pages['Release Tests/Hierarchy/README.md']['id'] in pages['Release Tests/Hierarchy/Child.md']['ancestors']
    for excluded in ['Release Tests/Excluded.md', 'Release Tests-private/Unselected.md', 'Source Notes/Reusable.md']:
        assert 'connie-page-id:' not in (root / excluded).read_text()
    if mode == 'unchanged':
        assert pages == json.loads(pathlib.Path('action-create.json').read_text()), 'Unchanged publishing changed remote content, attachments, labels, hierarchy or versions'
    if mode == 'update':
        previous = json.loads(pathlib.Path('action-unchanged.json').read_text())
        for file, page in pages.items():
            if file == 'Release Tests/Formatting.md':
                assert page['version'] == previous[file]['version'] + 1
                assert 'PUBLISHED ACTION UPDATE SENTINEL.' in json.dumps(page['adf'])
                assert page['attachments'] == previous[file]['attachments']
            else:
                assert page == previous[file], file
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write('## Published Action 6.0.0 verified\n\nCreate, unchanged and single-note update flows passed on the GitHub AMD64 runner with Mermaid/PlantUML attachments, hierarchy, tag selection and exclusions. Unchanged content preserved page versions, attachments and labels.\n\n')
            for page in pages.values():
                summary.write('- [' + page['title'] + '](' + base + '/wiki/spaces/MCRT20260907/pages/' + page['id'] + '/)\n')
    pathlib.Path('action-' + mode + '.json').write_text(json.dumps(pages))
print('Published Action verification:', mode, 'passed')
