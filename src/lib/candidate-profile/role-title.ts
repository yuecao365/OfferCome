/** 岗位名归一：去掉括注与资历词，同一岗位的不同写法落到同一个视角。纯函数，浏览器也能用。 */
export function normalizeRoleTitle(title: string): string {
  return title
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[（(].*?[）)]/g, " ")
    .replace(/(?:高级|资深|初级|中级|senior|junior|lead|intern|实习)/g, " ")
    .replace(/[\s/_-]+/g, " ")
    .trim();
}
