import { expect, test } from "@playwright/test";

test("public navigation and restricted institutional routes",async({page})=>{
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Welcome Back"})).toBeVisible();
  await page.getByRole("link",{name:"Login as Admin"}).click();
  await expect(page.getByRole("heading",{name:"Administrator login"})).toBeVisible();
  await page.getByRole("link",{name:"Go to staff login"}).click();
  await expect(page.getByRole("heading",{name:"Staff login",exact:true})).toBeVisible();
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("enroll a demo student and see their record after navigation",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/demo/admin/dashboard");
  await expect(page.getByText("Demo workspace")).toBeVisible();
  await page.getByRole("navigation",{name:"Workspace navigation"}).getByRole("link",{name:"Students",exact:true}).click();
  await page.getByRole("link",{name:"Add student"}).click();
  await page.getByLabel("Full name").fill("Test Student");
  await page.getByLabel("Admission number").fill("SCM-E2E-100");
  await page.getByLabel("Batch",{exact:false}).selectOption({label:"Class 6 · Batch A"});
  await page.getByRole("button",{name:"Save record"}).click();
  await expect(page).toHaveURL(/\/demo\/admin\/students$/);
  await page.getByLabel("Search records").fill("SCM-E2E-100");
  await expect(page.getByRole("cell",{name:"Test Student"})).toBeVisible();
  await page.getByRole("link",{name:"View",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Test Student"})).toBeVisible();
  expect(errors).toEqual([]);
});

test("staff marks attendance and reviews completed records",async({page})=>{
  await page.goto("/demo/staff/class-sessions?create=1");
  const dialog=page.getByRole("dialog");
  await expect(dialog.getByRole("heading",{name:"Record class session"})).toBeVisible();
  await dialog.getByLabel("Teaching assignment").selectOption({index:1});
  await dialog.getByRole("button",{name:"Mark all present"}).click();
  await dialog.getByRole("button",{name:"Submit session",exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("cell",{name:"completed",exact:true}).first()).toBeVisible();
});

test("demo report exports a PDF",async({page})=>{
  await page.goto("/demo/admin/reports/students/00000000-0000-4000-8000-000000000500");
  await expect(page.getByRole("heading",{name:"Aarav Mehta"})).toBeVisible();
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"Download PDF"}).click();
  expect((await downloadPromise).suggestedFilename()).toBe("demo-academic-report.pdf");
});

test("the timetable validates visible form inputs and renders calendar views",async({page})=>{
  await page.goto("/demo/admin/calendar");
  await expect(page.getByRole("button",{name:"Month",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Schedule class"}).click();
  const dialog=page.getByRole("dialog");
  await dialog.getByLabel("Session title").fill("New session");
  await dialog.getByLabel("Teaching assignment").selectOption({index:1});
  await dialog.getByLabel(/Starts/).fill("2030-02-04T10:00");
  await dialog.getByLabel(/Ends/).fill("2030-02-04T10:45");
  await dialog.getByRole("button",{name:"Save record"}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Calendar updated.")).toBeVisible();
});

test("staff edits scores and rejects marks above the maximum",async({page})=>{
  await page.goto("/demo/staff/marks");
  await page.getByRole("button",{name:"Enter marks"}).first().click();
  const dialog=page.getByRole("dialog");
  const firstMarks=dialog.getByRole("spinbutton",{name:/Marks for/}).first();
  await firstMarks.fill("51");
  await dialog.getByRole("button",{name:"Submit final marks"}).click();
  await expect(dialog.getByRole("alert")).toContainText("Check the marks");
  await firstMarks.fill("41");
  await dialog.getByRole("button",{name:"Submit final marks"}).click();
  await expect(dialog).not.toBeVisible();
});
