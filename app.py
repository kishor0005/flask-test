import os
import sys
import time
import platform
import datetime
import flask
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# Track application start time for uptime calculation
APP_START_TIME = time.time()

# Try to import psutil for system metrics, fall back gracefully if not available
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

def get_masked_env_vars():
    """Return environment variables with sensitive information masked."""
    sensitive_keys = {'secret', 'key', 'password', 'token', 'auth', 'database', 'pwd', 'credential'}
    masked_env = {}
    for k, v in os.environ.items():
        # Check if any sensitive keyword is in the env var name (case-insensitive)
        if any(sk in k.lower() for sk in sensitive_keys):
            masked_env[k] = "********"
        else:
            # Truncate very long values to keep dashboard readable
            masked_env[k] = v if len(v) < 100 else v[:97] + "..."
    return masked_env

def get_system_stats():
    """Retrieve system stats if psutil is available, otherwise return fallback info."""
    stats = {
        "psutil_available": HAS_PSUTIL,
        "cpu_count": os.cpu_count() or 1,
        "cpu_usage_percent": 0.0,
        "memory_total_gb": 0.0,
        "memory_used_gb": 0.0,
        "memory_usage_percent": 0.0,
        "load_average": "N/A"
    }

    if HAS_PSUTIL:
        try:
            stats["cpu_usage_percent"] = psutil.cpu_percent(interval=None)
            mem = psutil.virtual_memory()
            stats["memory_total_gb"] = round(mem.total / (1024 ** 3), 2)
            stats["memory_used_gb"] = round(mem.used / (1024 ** 3), 2)
            stats["memory_usage_percent"] = mem.percent
        except Exception as e:
            pass

    # Try to get system load average (only available on Unix-like systems)
    if hasattr(os, 'getloadavg'):
        try:
            stats["load_average"] = [round(x, 2) for x in os.getloadavg()]
        except Exception:
            pass

    return stats

@app.route('/')
def index():
    """Render the dashboard UI."""
    return render_template('index.html')

@app.route('/api/ping', methods=['GET'])
def ping():
    """Simple ping-pong health check endpoint."""
    return jsonify({
        "status": "online",
        "timestamp": time.time(),
        "message": "pong"
    })

@app.route('/api/info', methods=['GET'])
def info():
    """Retrieve comprehensive server metadata and resource consumption statistics."""
    # Remote Client IP resolution taking into account proxy headers
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()

    info_data = {
        "server_time_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "server_time_local": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S Local"),
        "uptime_seconds": round(time.time() - APP_START_TIME, 1),
        "os_details": {
            "system": platform.system(),
            "node": platform.node(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
            "processor": platform.processor() or "Unknown"
        },
        "runtime": {
            "python_version": sys.version,
            "flask_version": flask.__version__,
            "server_software": request.environ.get('SERVER_SOFTWARE', 'Development Server / Unknown')
        },
        "client_info": {
            "ip": client_ip,
            "user_agent": request.headers.get('User-Agent', 'Unknown'),
            "preferred_languages": [lang for lang in request.accept_languages.values()]
        },
        "request_headers": dict(request.headers),
        "environment_variables": get_masked_env_vars(),
        "system_stats": get_system_stats()
    }
    return jsonify(info_data)

@app.route('/api/test', methods=['POST'])
def test_post():
    """Echo endpoint to verify POST requests and server-side data processing."""
    data = request.get_json(silent=True) or {}
    
    input_text = data.get('text', '')
    repeat_count = data.get('repeat', 1)
    
    # Restrict input processing limits
    try:
        repeat_count = int(repeat_count)
        if repeat_count < 1 or repeat_count > 100:
            repeat_count = 1
    except (ValueError, TypeError):
        repeat_count = 1

    processed_text = (input_text[::-1] if data.get('reverse') else input_text) * repeat_count
    
    return jsonify({
        "status": "success",
        "processed_text": processed_text,
        "input_received": data,
        "timestamp": time.time()
    })

@app.route('/api/db-check', methods=['GET'])
def db_check():
    """Verify connectivity to the PostgreSQL database."""
    db_host = os.environ.get('DB_HOST', 'database-1.c70ackio80rc.eu-west-2.rds.amazonaws.com')
    db_port = os.environ.get('DB_PORT', '5432')
    db_name = os.environ.get('DB_NAME', 'postgres')
    db_user = os.environ.get('DB_USER', 'myflaskuser')
    db_password = os.environ.get('DB_PASSWORD', 'mysecurepassword')

    try:
        import psycopg2
    except ImportError:
        return jsonify({
            "status": "error",
            "message": "psycopg2 library is not installed."
        }), 500

    connection = None
    try:
        connection = psycopg2.connect(
            host=db_host,
            port=db_port,
            database=db_name,
            user=db_user,
            password=db_password,
            connect_timeout=5
        )
        cursor = connection.cursor()
        cursor.execute("SELECT version();")
        db_version = cursor.fetchone()[0]
        cursor.close()
        
        return jsonify({
            "status": "success",
            "message": "Successfully connected to PostgreSQL database.",
            "database": db_name,
            "version": db_version
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
    finally:
        if connection:
            connection.close()

@app.route('/api/db-query-test', methods=['POST'])
def db_query_test():
    """Create a test table, insert a test run, and retrieve the last 5 runs."""
    db_host = os.environ.get('DB_HOST', 'database-1.c70ackio80rc.eu-west-2.rds.amazonaws.com')
    db_port = os.environ.get('DB_PORT', '5432')
    db_name = os.environ.get('DB_NAME', 'postgres')
    db_user = os.environ.get('DB_USER', 'myflaskuser')
    db_password = os.environ.get('DB_PASSWORD', 'mysecurepassword')

    try:
        import psycopg2
    except ImportError:
        return jsonify({
            "status": "error",
            "message": "psycopg2 library is not installed."
        }), 500

    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()

    connection = None
    try:
        connection = psycopg2.connect(
            host=db_host,
            port=db_port,
            database=db_name,
            user=db_user,
            password=db_password,
            connect_timeout=5
        )
        cursor = connection.cursor()
        
        # 1. Create table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS host_sentinel_test_runs (
                id SERIAL PRIMARY KEY,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                client_ip VARCHAR(100),
                status VARCHAR(50)
            );
        """)
        connection.commit()

        # 2. Insert a test run record
        cursor.execute(
            "INSERT INTO host_sentinel_test_runs (client_ip, status) VALUES (%s, %s) RETURNING id, executed_at;",
            (client_ip, "Success")
        )
        new_id, new_executed_at = cursor.fetchone()
        connection.commit()

        # 3. Get total count of runs
        cursor.execute("SELECT COUNT(*) FROM host_sentinel_test_runs;")
        total_runs = cursor.fetchone()[0]

        # 4. Fetch last 5 runs
        cursor.execute("SELECT id, executed_at, client_ip, status FROM host_sentinel_test_runs ORDER BY id DESC LIMIT 5;")
        rows = cursor.fetchall()
        
        runs_list = []
        for r in rows:
            runs_list.append({
                "id": r[0],
                "executed_at": r[1].strftime("%Y-%m-%d %H:%M:%S UTC") if r[1] else "N/A",
                "client_ip": r[2],
                "status": r[3]
            })

        cursor.close()
        return jsonify({
            "status": "success",
            "message": f"Successfully executed read/write queries. Inserted record #{new_id}.",
            "new_record": {
                "id": new_id,
                "executed_at": new_executed_at.strftime("%Y-%m-%d %H:%M:%S UTC") if new_executed_at else "N/A",
                "client_ip": client_ip,
                "status": "Success"
            },
            "total_records": total_runs,
            "recent_runs": runs_list
        })
    except Exception as e:
        if connection:
            connection.rollback()
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
    finally:
        if connection:
            connection.close()

if __name__ == '__main__':
    # Default local development port is 5000
    port = int(os.environ.get('PORT', 5000))
    # We set debug=True for local testing
    app.run(host='0.0.0.0', port=port, debug=True)
