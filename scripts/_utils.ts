import { promises as fsp } from 'node:fs'
import { resolve } from 'pathe'
import { execaSync } from 'execa'
import { determineSemverChange, getGitDiff, loadChangelogConfig, parseCommits } from 'changelogen'

export interface Dep {
  name: string
  range: string
  type: string
}

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T
export type Package = ThenArg<ReturnType<typeof loadPackage>>

export async function loadPackage(dir: string) {
  const pkgPath = resolve(dir, 'package.json')
  const data = JSON.parse(await fsp.readFile(pkgPath, 'utf-8').catch(() => '{}'))
  const save = () => fsp.writeFile(pkgPath, JSON.stringify(data, null, 2) + '\n')

  const setVersion = (newVersion: string) => {
    data.version = newVersion
  }

  return {
    dir,
    data,
    save,
    setVersion,
  }
}

export async function determineBumpType() {
  const config = await loadChangelogConfig(process.cwd())
  const commits = await getLatestCommits()

  const bumpType = determineSemverChange(commits, config)

  return bumpType === 'major' ? 'minor' : bumpType
}

export async function getLatestCommits() {
  const config = await loadChangelogConfig(process.cwd())
  const latestTag = execaSync('git', ['describe', '--tags', '--abbrev=0']).stdout

  return parseCommits(await getGitDiff(latestTag), config)
}
