#!/usr/bin/env python3
"""
Test script to directly test the medical articles API functionality
"""

import requests
import json

def test_medical_articles_api():
    """Test the medical articles API endpoints"""
    base_url = "http://localhost:5001"
    
    print("🧪 Testing Medical Articles API")
    print("=" * 40)
    
    # Test health endpoint
    print("\n1. Testing health endpoint...")
    try:
        response = requests.get(f"{base_url}/api/health")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Health check: {data['status']}")
            print(f"   Medical lib available: {data['medical_lib_available']}")
            print(f"   Components: {data['components']}")
        else:
            print(f"❌ Health check failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Health check error: {e}")
    
    # Register a user
    print("\n2. Registering test user...")
    try:
        response = requests.post(f"{base_url}/api/auth/register", 
                               json={"email": "apitest5@example.com", 
                                    "password": "testpass", 
                                    "fullName": "API Test User 2"})
        if response.status_code == 200:
            data = response.json()
            token = data['token']
            print(f"✅ User registered: {data['user']['email']}")
            print(f"   Token: {token[:50]}...")
        else:
            print(f"❌ Registration failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return
    except Exception as e:
        print(f"❌ Registration error: {e}")
        return
    
    # Test medical articles search
    print("\n3. Testing medical articles search...")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{base_url}/api/medical-articles/search?q=arthritis&limit=3", 
                              headers=headers)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Search successful: {len(data['results'])} results")
            print(f"   Total articles: {data['total_count']}")
            if data['results']:
                article = data['results'][0]
                print(f"   Sample article: {article['title'][:80]}...")
        else:
            print(f"❌ Search failed: {response.status_code}")
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"❌ Search error: {e}")
    
    # Test medical articles stats
    print("\n4. Testing medical articles stats...")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{base_url}/api/medical-articles/stats", 
                              headers=headers)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Stats retrieved:")
            print(f"   Total articles: {data['total_articles']}")
            print(f"   Unique journals: {data['unique_journals']}")
            print(f"   Years covered: {data['years_covered']}")
            if data['top_journals']:
                print(f"   Top journal: {data['top_journals'][0]['journal']} ({data['top_journals'][0]['count']} articles)")
        else:
            print(f"❌ Stats failed: {response.status_code}")
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"❌ Stats error: {e}")
    
    # Test getting a specific article
    print("\n5. Testing get specific article...")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{base_url}/api/medical-articles/1", 
                              headers=headers)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Article retrieved:")
            print(f"   Title: {data['title'][:80]}...")
            print(f"   Journal: {data['journal']}")
            print(f"   Authors: {data['authors'][:60]}...")
        else:
            print(f"❌ Get article failed: {response.status_code}")
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"❌ Get article error: {e}")
    
    print("\n✅ API testing complete!")

if __name__ == "__main__":
    test_medical_articles_api()
