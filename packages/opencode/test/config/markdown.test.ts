import { expect, test, describe } from "bun:test"
import { ConfigMarkdown } from "../../src/config/markdown"

describe("ConfigMarkdown: normal template", () => {
  const template = `This is a @valid/path/to/a/file and it should also match at
  the beginning of a line:

  @another-valid/path/to/a/file

  but this is not:

     - Adds a "Co-authored-by:" footer which clarifies which AI agent
       helped create this commit, using an appropriate \`noreply@...\`
       or \`noreply@anthropic.com\` email address.

  We also need to deal with files followed by @commas, ones
  with @file-extensions.md, even @multiple.extensions.bak,
  hidden directories like @.config/ or files like @.bashrc
  and ones at the end of a sentence like @foo.md.

  Also shouldn't forget @/absolute/paths.txt with and @/without/extensions,
  as well as @~/home-files and @~/paths/under/home.txt.

  If the reference is \`@quoted/in/backticks\` then it shouldn't match at all.`

  const matches = ConfigMarkdown.files(template)

  test("should extract exactly 12 file references", () => {
    expect(matches.length).toBe(12)
  })

  test("should extract valid/path/to/a/file", () => {
    expect(matches[0][1]).toBe("valid/path/to/a/file")
  })

  test("should extract another-valid/path/to/a/file", () => {
    expect(matches[1][1]).toBe("another-valid/path/to/a/file")
  })

  test("should extract paths ignoring comma after", () => {
    expect(matches[2][1]).toBe("commas")
  })

  test("should extract a path with a file extension and comma after", () => {
    expect(matches[3][1]).toBe("file-extensions.md")
  })

  test("should extract a path with multiple dots and comma after", () => {
    expect(matches[4][1]).toBe("multiple.extensions.bak")
  })

  test("should extract hidden directory", () => {
    expect(matches[5][1]).toBe(".config/")
  })

  test("should extract hidden file", () => {
    expect(matches[6][1]).toBe(".bashrc")
  })

  test("should extract a file ignoring period at end of sentence", () => {
    expect(matches[7][1]).toBe("foo.md")
  })

  test("should extract an absolute path with an extension", () => {
    expect(matches[8][1]).toBe("/absolute/paths.txt")
  })

  test("should extract an absolute path without an extension", () => {
    expect(matches[9][1]).toBe("/without/extensions")
  })

  test("should extract an absolute path in home directory", () => {
    expect(matches[10][1]).toBe("~/home-files")
  })

  test("should extract an absolute path under home directory", () => {
    expect(matches[11][1]).toBe("~/paths/under/home.txt")
  })

  test("should not match when preceded by backtick", () => {
    const backtickTest = "This `@should/not/match` should be ignored"
    const backtickMatches = ConfigMarkdown.files(backtickTest)
    expect(backtickMatches.length).toBe(0)
  })

  test("should not match email addresses", () => {
    const emailTest = "Contact user@example.com for help"
    const emailMatches = ConfigMarkdown.files(emailTest)
    expect(emailMatches.length).toBe(0)
  })
})

describe("ConfigMarkdown: frontmatter parsing", async () => {
  const template = `---
description: "This is a description wrapped in quotes"
# field: this is a commented out field that should be ignored
occupation: This man has the following occupation: Software Engineer
title: 'Hello World'
name: John "Doe"

family: He has no 'family'
summary: >
  This is a summary
url: https://example.com:8080/path?query=value
time: The time is 12:30:00 PM
nested: First: Second: Third: Fourth
quoted_colon: "Already quoted: no change needed"
single_quoted_colon: 'Single quoted: also fine'
mixed: He said "hello: world" and then left
empty:
dollar: Use $' and $& for special patterns
---

Content that should not be parsed:

fake_field: this is not yaml
another: neither is this
time: 10:30:00 AM
url: https://should-not-be-parsed.com:3000

The above lines look like YAML but are just content.
`

  const matter = await import("gray-matter")
  const preprocessed = ConfigMarkdown.preprocessFrontmatter(template)
  const parsed = matter.default(preprocessed)

  test("should parse without throwing", () => {
    expect(parsed).toBeDefined()
    expect(parsed.data).toBeDefined()
    expect(parsed.content).toBeDefined()
  })

  test("should extract description field", () => {
    expect(parsed.data.description).toBe("This is a description wrapped in quotes")
  })

  test("should extract occupation field with colon in value", () => {
    expect(parsed.data.occupation).toBe("This man has the following occupation: Software Engineer\n")
  })

  test("should extract title field with single quotes", () => {
    expect(parsed.data.title).toBe("Hello World")
  })

  test("should extract name field with embedded quotes", () => {
    expect(parsed.data.name).toBe('John "Doe"')
  })

  test("should extract family field with embedded single quotes", () => {
    expect(parsed.data.family).toBe("He has no 'family'")
  })

  test("should extract multiline summary field", () => {
    expect(parsed.data.summary).toBe("This is a summary\n")
  })

  test("should not include commented fields in data", () => {
    expect(parsed.data.field).toBeUndefined()
  })

  test("should extract URL with port", () => {
    expect(parsed.data.url).toBe("https://example.com:8080/path?query=value\n")
  })

  test("should extract time with colons", () => {
    expect(parsed.data.time).toBe("The time is 12:30:00 PM\n")
  })

  test("should extract value with multiple colons", () => {
    expect(parsed.data.nested).toBe("First: Second: Third: Fourth\n")
  })

  test("should preserve already double-quoted values with colons", () => {
    expect(parsed.data.quoted_colon).toBe("Already quoted: no change needed")
  })

  test("should preserve already single-quoted values with colons", () => {
    expect(parsed.data.single_quoted_colon).toBe("Single quoted: also fine")
  })

  test("should extract value with quotes and colons mixed", () => {
    expect(parsed.data.mixed).toBe('He said "hello: world" and then left\n')
  })

  test("should handle empty values", () => {
    expect(parsed.data.empty).toBeNull()
  })

  test("should handle dollar sign replacement patterns literally", () => {
    expect(parsed.data.dollar).toBe("Use $' and $& for special patterns")
  })

  test("should not parse fake yaml from content", () => {
    expect(parsed.data.fake_field).toBeUndefined()
    expect(parsed.data.another).toBeUndefined()
  })

  test("should extract content after frontmatter without modification", () => {
    expect(parsed.content).toContain("Content that should not be parsed:")
    expect(parsed.content).toContain("fake_field: this is not yaml")
    expect(parsed.content).toContain("url: https://should-not-be-parsed.com:3000")
  })
})
