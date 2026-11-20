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
    assert('Health sends no-cache headers', hRes.headers['cache-control']?.includes('no-cache'));

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

    console.log('\n--- 5. Student Registration & Database Persistence (With Phone) ---');
    const regTimestamp = Date.now();
    const testRegNo = `26MTEST${regTimestamp % 10000}`;
    const testEmail = `student${regTimestamp}@mahendra.info`;
    const testPhone = `+91 98765${String(regTimestamp).slice(-5)}`;
    const newStudentRes = await invokeApi('POST', '/api/auth/student/register', {}, {
      name: 'Vercel Test Student',
      email: testEmail,
      phone: testPhone,
      regNo: testRegNo,
      password: 'SecurePassword123!',
      department: 'Computer Science and Engineering',
      program: 'B.E. Computer Science and Engineering',
      year: 'Year 1',
      section: 'Sec A'
    });
    assert('Registration returns 200', newStudentRes.status === 200);
    assert('Registration returns student object', Boolean(newStudentRes.json?.student));
    assert('Registration stores phone correctly', newStudentRes.json?.student?.phone === testPhone);
    assert('Registration student has no password property exposed', newStudentRes.json?.student?.password === undefined);
    assert('Registration returns auth token', Boolean(newStudentRes.json?.token));
    const studentToken = newStudentRes.json?.token;
    const studentId = newStudentRes.json?.student?.id;

    console.log('\n--- 6. Duplicate Registration Checks (HTTP 409) ---');
    // Dup RegNo
    const dupRegRes = await invokeApi('POST', '/api/auth/student/register', {}, {
      name: 'Duplicate Reg Student',
      email: `other${regTimestamp}@mahendra.info`,
      phone: `+91 11111${String(regTimestamp).slice(-5)}`,
      regNo: testRegNo,
      password: 'AnotherPassword123!'
    });
    assert('Duplicate register number returns 409 Conflict', dupRegRes.status === 409);
    assert('Error specifies register number', dupRegRes.json?.error?.includes('register number'));

    // Dup Email
    const dupEmailRes = await invokeApi('POST', '/api/auth/student/register', {}, {
      name: 'Duplicate Email Student',
      email: testEmail,
      phone: `+91 22222${String(regTimestamp).slice(-5)}`,
      regNo: `DIFF${regTimestamp % 10000}`,
      password: 'AnotherPassword123!'
    });
    assert('Duplicate email returns 409 Conflict', dupEmailRes.status === 409);
    assert('Error specifies email', dupEmailRes.json?.error?.includes('email'));

    // Dup Phone
    const dupPhoneRes = await invokeApi('POST', '/api/auth/student/register', {}, {
      name: 'Duplicate Phone Student',
      email: `unique${regTimestamp}@mahendra.info`,
      phone: testPhone,
      regNo: `DIFF2${regTimestamp % 10000}`,
      password: 'AnotherPassword123!'
    });
    assert('Duplicate phone returns 409 Conflict', dupPhoneRes.status === 409);
    assert('Error specifies phone', dupPhoneRes.json?.error?.includes('phone'));

    console.log('\n--- 7. Case-Insensitive, Whitespace-Tolerant, and Identifier Search ---');
    // Login with lowercase and whitespace
    const lowerWhitespaceLogin = await invokeApi('POST', '/api/auth/student/login', {}, {
      identifier: `   ${testRegNo.toLowerCase()}   `,
      password: 'SecurePassword123!'
    });
    assert('Login with lowercase + surrounding whitespace returns 200', lowerWhitespaceLogin.status === 200);
    assert('Student recognized and authenticated', lowerWhitespaceLogin.json?.student?.regNo === testRegNo);

    // Login with student email
    const emailLogin = await invokeApi('POST', '/api/auth/student/login', {}, {
      identifier: `  ${testEmail.toUpperCase()}  `,
      password: 'SecurePassword123!'
    });
    assert('Login with student email returns 200', emailLogin.status === 200);

    // Login with student phone number
    const phoneLogin = await invokeApi('POST', '/api/auth/student/login', {}, {
      identifier: testPhone,
      password: 'SecurePassword123!'
    });
    assert('Login with phone number returns 200', phoneLogin.status === 200);

    // Login with full student name
    const nameLogin = await invokeApi('POST', '/api/auth/student/login', {}, {
      identifier: '  Vercel   Test   Student  ',
      password: 'SecurePassword123!'
    });
    assert('Login with normalized full name returns 200', nameLogin.status === 200);

    // Wrong password check
    const badStuLoginRes = await invokeApi('POST', '/api/auth/student/login', {}, {
      identifier: testRegNo,
      password: 'IncorrectPassword'
    });
    assert('Student wrong password returns 401', badStuLoginRes.status === 401);
    assert('Student wrong password error message', badStuLoginRes.json?.error === 'Incorrect Password');

    console.log('\n--- 8. Multiple Login and Logout Cycles (No Permanent Lockout) ---');
    for (let cycle = 1; cycle <= 3; cycle++) {
      const cycleLogin = await invokeApi('POST', '/api/auth/student/login', {}, {
        identifier: testRegNo,
        password: 'SecurePassword123!'
      });
      assert(`Cycle ${cycle}: Student login succeeds`, cycleLogin.status === 200);
      assert(`Cycle ${cycle}: Token issued`, Boolean(cycleLogin.json?.token));

      const cycleLogout = await invokeApi('POST', '/api/auth/logout', {
        'x-auth-token': cycleLogin.json?.token
      });
      assert(`Cycle ${cycle}: Student logout succeeds`, cycleLogout.status === 200);
    }

    console.log('\n--- 9. Admin to Student Real-Time Synchronization ---');
    // Fetch initial state
    const initialState = await invokeApi('GET', '/api/state');
    const initialRev = initialState.json?.revision || 1;

    // Admin updates a live classroom and adds a notice
    const updatePayload = {
      ...initialState.json,
      notices: [
        {
          id: `not-${Date.now()}`,
          title: `Real-Time Campus Alert Test ${Date.now()}`,
          category: 'Exam',
          target: 'All Students',
          pinned: true,
          date: new Date().toISOString()
        },
        ...(initialState.json?.notices || [])
      ]
    };

    const adminUpdateRes = await invokeApi('PUT', '/api/state', {
      'x-auth-token': adminToken
    }, updatePayload);
    assert('Admin PUT state succeeds (200)', adminUpdateRes.status === 200);

    // Student fetches latest state
    const studentRefreshedState = await invokeApi('GET', '/api/state');
    assert('Student refetch returns 200', studentRefreshedState.status === 200);
    assert('Revision bumped higher than initial', studentRefreshedState.json?.revision > initialRev);
    assert('Student sees the new admin notice immediately', studentRefreshedState.json?.notices?.[0]?.title.includes('Real-Time Campus Alert Test'));

    console.log('\n--- 10. Role Separation & Route Protection ---');
    const studentStatePutRes = await invokeApi('PUT', '/api/state', {
      'x-auth-token': studentToken
    }, { settings: {} });
    assert('Student PUT state is forbidden (403)', studentStatePutRes.status === 403);

    console.log('\n--- 11. Student Action & Password Change ---');
    const actionRes = await invokeApi('POST', '/api/student/action', {
      'x-auth-token': studentToken
    }, {
      action: 'appendChatMessage',
      message: { id: 'msg-' + Date.now(), text: 'Testing student action', sender: 'student' }
    });
    assert('Student action returns 200', actionRes.status === 200);

    const changePwdRes = await invokeApi('POST', '/api/auth/student/change-password', {
      'x-auth-token': studentToken
    }, {
      currentPassword: 'SecurePassword123!',
      newPassword: 'UpdatedSecure2026!'
    });
    assert('Change password returns 200', changePwdRes.status === 200);

    const newPwdLoginRes = await invokeApi('POST', '/api/auth/student/login', {}, {
      identifier: testRegNo,
      password: 'UpdatedSecure2026!'
    });
    assert('Login with updated password succeeds (200)', newPwdLoginRes.status === 200);

    console.log('\n--- 12. Security Verification: Zero Password Leakage ---');
    const finalState = await invokeApi('GET', '/api/state');
    const leakedPasswordFound = finalState.json?.students?.some(s => s && (s.password || s._newPassword));
    assert('Final state sanitization: zero student passwords leaked', !leakedPasswordFound);

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
