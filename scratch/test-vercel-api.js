const { EventEmitter } = require('events');
const handler = require('../api/index.js');

function invokeApi(method, path, headers = {}, body = null) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = path;
    req.headers = {
      'content-type': 'application/json',
      ...headers
    };
    req.body = body;

    const resHeaders = {};
    const res = {
      statusCode: 200,
      headers: resHeaders,
      setHeader(k, v) {
        resHeaders[k.toLowerCase()] = v;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.setHeader('content-type', 'application/json; charset=utf-8');
        resolve({
          status: this.statusCode,
          headers: this.headers,
          json: data,
          raw: JSON.stringify(data)
        });
      },
      end(data) {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({
          status: this.statusCode,
          headers: this.headers,
          json,
          raw: data
        });
      }
    };

    handler(req, res).catch((err) => {
      resolve({ status: 500, error: err });
    });

    if (body && typeof body === 'object') {
      req.emit('data', JSON.stringify(body));
    }
    req.emit('end');
  });
}

async function runTests() {
  console.log('Testing Vercel Serverless Function (api/index.js) in-process...\n');

  let passed = 0;
  let failed = 0;

  function assert(title, condition, extra = '') {
    if (condition) {
      console.log(`  PASS: ${title}`);
      passed++;
    } else {
      console.error(`  FAIL: ${title} ${extra}`);
      failed++;
    }
  }

  try {
    console.log('--- 1. Health & Version Endpoints ---');
    const hRes = await invokeApi('GET', '/api/health');
    assert('Health returns 200', hRes.status === 200);
    assert('Health reports serverVersion 2.0-vercel', hRes.json?.serverVersion === '2.0-vercel');
    assert('Health reports authEnabled true', hRes.json?.authEnabled === true);
    assert('Health sends CORS headers', hRes.headers['access-control-allow-origin'] === '*');

    const vRes = await invokeApi('GET', '/api/version');
    assert('Version returns 200', vRes.status === 200);
    assert('Version contains revision number', typeof vRes.json?.revision === 'number');

    console.log('\n--- 2. CORS Preflight (OPTIONS) ---');
    const optRes = await invokeApi('OPTIONS', '/api/health');
    assert('OPTIONS returns 204', optRes.status === 204);
    assert('OPTIONS contains Access-Control-Allow-Methods', Boolean(optRes.headers['access-control-allow-methods']));

    console.log('\n--- 3. Admin Authentication ---');
    const badAdminRes = await invokeApi('POST', '/api/auth/admin/login', {}, {
      name: 'Naveen Kumar',
      password: 'WrongPassword123!'
    });
    assert('Admin wrong password returns 401', badAdminRes.status === 401);
    assert('Admin wrong password error message', badAdminRes.json?.error === 'Invalid administrator name or password');

    const adminLoginRes = await invokeApi('POST', '/api/auth/admin/login', {}, {
      name: 'Naveen Kumar',
      password: 'Naveen@2008'
    });
    assert('Admin correct login returns 200', adminLoginRes.status === 200);
    assert('Admin login returns token', Boolean(adminLoginRes.json?.token));
    assert('Admin login role is admin', adminLoginRes.json?.role === 'admin');
    const adminToken = adminLoginRes.json?.token;

    console.log('\n--- 4. Auth Me Check ---');
    const meNoTokenRes = await invokeApi('GET', '/api/auth/me');
    assert('Me without token returns 401', meNoTokenRes.status === 401);

    const meAdminRes = await invokeApi('GET', '/api/auth/me', {
      'x-auth-token': adminToken
    });
    assert('Me with admin token returns 200', meAdminRes.status === 200);
    assert('Me reports authenticated: true', meAdminRes.json?.authenticated === true);
    assert('Me reports role: admin', meAdminRes.json?.role === 'admin');

    console.log('\n--- 5. Student Registration & Validation ---');
    const regTimestamp = Date.now();
    const testRegNo = `26MTEST${regTimestamp % 10000}`;
    const testEmail = `test${regTimestamp}@mahendra.info`;
    const newStudentRes = await invokeApi('POST', '/api/auth/student/register', {}, {
      name: 'Vercel Test Student',
      email: testEmail,
      regNo: testRegNo,
      password: 'SecurePassword123!',
      department: 'CSE',
      year: 'Year 1'
    });
    assert('Registration returns 200', newStudentRes.status === 200);
    assert('Registration returns student object', Boolean(newStudentRes.json?.student));
    assert('Registration student has no password property', newStudentRes.json?.student?.password === undefined);
    assert('Registration returns auth token', Boolean(newStudentRes.json?.token));
    const studentToken = newStudentRes.json?.token;
    const studentId = newStudentRes.json?.student?.id;

    console.log('\n--- 6. Duplicate Registration Check (HTTP 409) ---');
    const dupRes = await invokeApi('POST', '/api/auth/student/register', {}, {
      name: 'Duplicate Student',
      email: testEmail,
      regNo: testRegNo,
      password: 'AnotherPassword123!'
    });
    assert('Duplicate registration returns 409 Conflict', dupRes.status === 409);
    assert('Duplicate error mentions register number or email', dupRes.json?.error?.includes('already exists'));

    console.log('\n--- 7. Student Login & Credential Verification ---');
    const badStuLoginRes = await invokeApi('POST', '/api/auth/student/login', {}, {
      identifier: testRegNo,
      password: 'IncorrectPassword'
    });
    assert('Student wrong password returns 401', badStuLoginRes.status === 401);
    assert('Student wrong password error message', badStuLoginRes.json?.error === 'Incorrect Password');

    const goodStuLoginRes = await invokeApi('POST', '/api/auth/student/login', {}, {
      identifier: testRegNo,
      password: 'SecurePassword123!'
    });
    assert('Student correct login returns 200', goodStuLoginRes.status === 200);
    assert('Student login returns active token', Boolean(goodStuLoginRes.json?.token));
    assert('Student status is Active', goodStuLoginRes.json?.student?.status === 'Active');
    assert('Student hasLoggedIn is true', goodStuLoginRes.json?.student?.hasLoggedIn === true);

    console.log('\n--- 8. Existing Registered Student Login ---');
    // Check one of the existing students in db.json (26M1705257)
    const existingStuLoginRes = await invokeApi('POST', '/api/auth/student/login', {}, {
      identifier: '26M1705257',
      password: 'password' // or let's test if identifier check resolves
    });
    assert('Existing student recognized (valid or incorrect pwd response, not 404)', existingStuLoginRes.status === 200 || existingStuLoginRes.status === 401);

    console.log('\n--- 9. State GET & Sanitization ---');
    const stateRes = await invokeApi('GET', '/api/state');
    assert('State returns 200', stateRes.status === 200);
    assert('State contains collegeName MAHENDRA ENGINEERING COLLEGE', stateRes.json?.settings?.collegeName === 'MAHENDRA ENGINEERING COLLEGE');
    assert('State contains registered students', Array.isArray(stateRes.json?.students) && stateRes.json.students.length > 0);
    const anyStudentWithPassword = stateRes.json?.students?.some(s => s && (s.password || s._newPassword));
    assert('State sanitization: zero student passwords exposed', !anyStudentWithPassword);

    console.log('\n--- 10. Role Separation & Route Protection ---');
    const studentStatePutRes = await invokeApi('PUT', '/api/state', {
      'x-auth-token': studentToken
    }, { settings: {} });
    assert('Student PUT state is forbidden (403)', studentStatePutRes.status === 403);

    const adminStatePutRes = await invokeApi('PUT', '/api/state', {
      'x-auth-token': adminToken
    }, {
      ...stateRes.json,
      settings: {
        ...stateRes.json.settings,
        shortName: 'Live AI Classroom'
      }
    });
    assert('Admin PUT state returns 200', adminStatePutRes.status === 200);

    console.log('\n--- 11. Student Action (Chat / Avatar / Assignment) ---');
    const actionRes = await invokeApi('POST', '/api/student/action', {
      'x-auth-token': studentToken
    }, {
      action: 'appendChatMessage',
      message: { id: 'msg-' + Date.now(), text: 'Hello Vercel Serverless', sender: 'student' }
    });
    assert('Student action returns 200', actionRes.status === 200);

    console.log('\n--- 12. Student Change Password ---');
    const changePwdRes = await invokeApi('POST', '/api/auth/student/change-password', {
      'x-auth-token': studentToken
    }, {
      currentPassword: 'SecurePassword123!',
      newPassword: 'UpdatedPassword2026!'
    });
    assert('Change password returns 200', changePwdRes.status === 200);

    const newPwdLoginRes = await invokeApi('POST', '/api/auth/student/login', {}, {
      identifier: testEmail,
      password: 'UpdatedPassword2026!'
    });
    assert('Login with new password returns 200', newPwdLoginRes.status === 200);

    console.log('\n--- 13. 404 Route Not Found & Logout ---');
    const notFoundRes = await invokeApi('GET', '/api/unknown-route-12345');
    assert('Unknown route returns 404', notFoundRes.status === 404);

    const logoutRes = await invokeApi('POST', '/api/auth/logout', {
      'x-auth-token': adminToken
    });
    assert('Logout returns 200', logoutRes.status === 200);

    const meAfterLogoutRes = await invokeApi('GET', '/api/auth/me', {
      'x-auth-token': adminToken
    });
    assert('Me after logout returns 401', meAfterLogoutRes.status === 401);

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    console.log(`\n========================================`);
    console.log(`Test Results: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);
    process.exit(failed === 0 ? 0 : 1);
  }
}

runTests();
