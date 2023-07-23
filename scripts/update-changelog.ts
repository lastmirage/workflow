import { execSync } from 'node:child_process'
import { $fetch } from 'ofetch'
import { inc } from 'semver'
import { generateMarkDown, loadChangelogConfig } from 'changelogen'
import { determineBumpType, getLatestCommits, loadPackage } from './_utils'

const EMAIL = 'lastmirage@tooning.kr'
const NAME = 'lastmirage'
// const URI = 'https://api.github.com/repos/tooning/cms-next'
const URI = 'https://api.github.com/repos/lastmirage/workflow'

async function main() {
  const workspace = await loadPackage(process.cwd())
  const config = await loadChangelogConfig(process.cwd(), {})

  console.log(workspace.data.version)

  const commits = await getLatestCommits().then((commits) =>
    commits.filter((c) => config.types[c.type] && !(c.type === 'chore' && c.scope === 'deps' && !c.isBreaking))
  )
  const bumpType = await determineBumpType()

  const newVersion = inc(workspace.data.version, bumpType || 'patch')
  const changelog = await generateMarkDown(commits, config)

  console.log('bumpType', bumpType)
  console.log('newVersion', newVersion)

  // Create and push a branch with bumped versions if it has not already been created
  const branchExists = execSync(`git ls-remote --heads origin v${newVersion}`).toString().trim().length > 0
  if (!branchExists) {
    execSync(`git config --global user.email "${EMAIL}"`)
    execSync(`git config --global user.name "${NAME}"`)
    execSync(`git checkout -b v${newVersion}`)

    workspace.setVersion(newVersion!)

    await workspace.save()

    execSync(`git commit -am v${newVersion}`)
    execSync(`git push -u origin v${newVersion}`)
  }

  console.log('token', process.env.GITHUB_TOKEN)

  // Get the current PR for this release, if it exists
  const [currentPR] = await $fetch(`${URI}/pulls?head=lastmirage:v${newVersion}`, {
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  })

  const releaseNotes = [
    currentPR?.body.replace(/## 👉 Changelog[\s\S]*$/, '') ||
      `> ${newVersion} is the next ${bumpType} release.\n>\n> **Timetable**: to be announced.`,
    '## 👉 Changelog',
    changelog.replace(/^## v.*?\n/, '').replace('...develop', `...v${newVersion}`),
  ].join('\n')

  // Create a PR with release notes if none exists
  if (!currentPR) {
    console.log('create a new PR')

    return await $fetch(`${URI}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
      },
      body: {
        title: `v${newVersion}`,
        head: `v${newVersion}`,
        base: 'develop',
        body: releaseNotes,
        // draft: true,
      },
    })
  }

  // Update release notes if the pull request does exist
  await $fetch(`${URI}/pulls/${currentPR.number}`, {
    method: 'PATCH',
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
    body: {
      body: releaseNotes,
    },
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
